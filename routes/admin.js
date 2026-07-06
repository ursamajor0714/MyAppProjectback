const express = require('express');
const prisma = require('../db');
const { authenticateToken, requireRole } = require('../middleware');

const router = express.Router();

// 모든 관리자용 API는 authenticateToken, requireRole(['admin']) 미들웨어로 보호

// 1. 대시보드 요약 통계 조회 (상세 통계 데이터 추가 - 병렬 쿼리로 초고속 최적화)
router.get('/stats', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const [
      totalUsers,
      activeGps,
      activeSos,
      activeSessions,
      totalReports,
      reportsGroup,
      revenueAgg,
      totalAlarms,
      totalDocuments,
      dbProducts,
      allDbProducts
    ] = await Promise.all([
      prisma.user.count(),
      prisma.gpsSetting.count({
        where: { connectionStatus: 'linked' }
      }),
      prisma.sosAlert.count({
        where: { status: { in: ['triggered', 'called', 'messaged', 'siren_played'] } }
      }),
      prisma.telemedicineSession.count({
        where: { status: { in: ['waiting', 'ongoing'] } }
      }),
      prisma.symptomReport.count(),
      prisma.symptomReport.groupBy({
        by: ['riskLevel'],
        _count: true
      }),
      prisma.telemedicineSession.aggregate({
        where: { paid: true },
        _sum: { billAmount: true }
      }),
      prisma.medicationAlarm.count(),
      prisma.insuranceDocument.count(),
      prisma.product.findMany({
        orderBy: { sales: 'desc' },
        take: 5
      }),
      prisma.product.findMany()
    ]);

    const reportsByRisk = { low: 0, medium: 0, high: 0, very_high: 0 };
    reportsGroup.forEach(g => {
      if (g.riskLevel in reportsByRisk) {
        reportsByRisk[g.riskLevel] = g._count;
      }
    });

    const telemedicineRevenue = revenueAgg._sum.billAmount || 0;
    const dbSalesSum = allDbProducts.reduce((acc, p) => acc + (p.sales * p.price), 0);
    const dbOrdersCount = allDbProducts.reduce((acc, p) => acc + p.sales, 0);

    const storeStats = {
      totalOrders: dbOrdersCount,
      totalSalesAmount: dbSalesSum + telemedicineRevenue,
      popularProducts: dbProducts
    };

    res.json({
      totalUsers,
      activeGps,
      activeSos,
      activeSessions,
      healthStats: {
        totalReports,
        reportsByRisk,
        totalAlarms
      },
      storeStats,
      telemedicineStats: {
        totalDocuments,
        revenue: telemedicineRevenue
      }
    });
  } catch (error) {
    console.error('Get admin stats error:', error);
    res.status(500).json({ error: '관리자 통계를 가져오는 중 오류 발생.' });
  }
});

// 2. 전체 사용자 목록 조회
router.get('/users', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        role: true,
        createdAt: true,
        age: true,
        gender: true
      }
    });
    res.json(users);
  } catch (error) {
    console.error('Get admin users error:', error);
    res.status(500).json({ error: '전체 사용자 목록을 조회하는 중 오류 발생.' });
  }
});

// 3. 특정 사용자 상세 정보 및 활동 이력 전체 조회
router.get('/users/:id/details', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { id } = req.params;
  try {
    const user = await prisma.user.findUnique({
      where: { id: Number(id) },
      include: {
        symptomReports: { orderBy: { createdAt: 'desc' } },
        medicationAlarms: { orderBy: { createdAt: 'desc' } },
        telemedicineSessions: { orderBy: { createdAt: 'desc' } },
        insuranceDocuments: { orderBy: { createdAt: 'desc' } },
        gpsSettings: {
          include: {
            gpsLogs: { orderBy: { createdAt: 'desc' }, take: 10 },
            sosAlerts: { orderBy: { createdAt: 'desc' }, take: 5 }
          }
        }
      }
    });

    if (!user) {
      return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
    }

    const { password: _, ...userWithoutPassword } = user;
    res.json(userWithoutPassword);
  } catch (error) {
    console.error('Get user details error:', error);
    res.status(500).json({ error: '사용자 상세 정보를 가져오는 중 오류 발생.' });
  }
});

// 4. 사용자 세부 정보 강제 수정 (의사 전용 면허/소속 병원/전공과목 수정 가능하도록 확장)
router.put('/users/:id/details', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { id } = req.params;
  const { name, email, phone, age, gender, height, weight, role, department, hospitalName, doctorLicense } = req.body;

  try {
    const updated = await prisma.user.update({
      where: { id: Number(id) },
      data: {
        name,
        email,
        phone,
        age: age ? Number(age) : null,
        gender,
        height: height ? parseFloat(height) : null,
        weight: weight ? parseFloat(weight) : null,
        role: role || undefined,
        department,
        hospitalName,
        doctorLicense
      }
    });
    const { password: _, ...userWithoutPassword } = updated;
    res.json(userWithoutPassword);
  } catch (error) {
    console.error('Update user details error:', error);
    res.status(500).json({ error: '사용자 정보 수정 중 오류 발생.' });
  }
});

// 5. 사용자 권한(Role) 수정 (레거시 호환용 유지)
router.put('/users/:id/role', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { id } = req.params;
  const { role } = req.body;

  if (!role || !['patient', 'doctor', 'admin'].includes(role)) {
    return res.status(400).json({ error: '올바른 역할(patient, doctor, admin)을 입력해 주세요.' });
  }

  try {
    const updated = await prisma.user.update({
      where: { id: Number(id) },
      data: { role },
      select: { id: true, email: true, name: true, role: true }
    });
    res.json(updated);
  } catch (error) {
    console.error('Update user role error:', error);
    res.status(500).json({ error: '사용자 역할 수정 중 오류 발생.' });
  }
});

// 6. 전체 비대면 진료 내역 조회 (필터 가능 & 환자 이력 및 세부 스펙 포함하도록 고도화)
router.get('/telemedicine/sessions', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { status } = req.query;
  try {
    const sessions = await prisma.telemedicineSession.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            age: true,
            gender: true,
            height: true,
            weight: true,
            symptomReports: {
              orderBy: { createdAt: 'desc' },
              take: 3
            }
          }
        }
      }
    });
    res.json(sessions);
  } catch (error) {
    console.error('Get admin telemedicine error:', error);
    res.status(500).json({ error: '비대면 진료 내역을 가져오는 중 오류 발생.' });
  }
});

// 7. 전체 안심 GPS 리스트 및 최근 위치 로그 조회 (최근 SOS 내역 일체 포함)
router.get('/gps/settings', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const settings = await prisma.gpsSetting.findMany({
      orderBy: { updatedAt: 'desc' },
      include: {
        guardian: {
          select: { name: true, email: true, phone: true }
        },
        gpsLogs: {
          orderBy: { createdAt: 'desc' },
          take: 10
        },
        sosAlerts: {
          orderBy: { createdAt: 'desc' },
          take: 10
        }
      }
    });
    res.json(settings);
  } catch (error) {
    console.error('Get admin GPS settings error:', error);
    res.status(500).json({ error: 'GPS 안심 설정 현황을 가져오는 중 오류 발생.' });
  }
});

// 8. 건강체크 증상 메타데이터 전체 조회
router.get('/symptoms', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const list = await prisma.symptomMetadata.findMany({
      orderBy: [
        { part: 'asc' },
        { isInternal: 'asc' }
      ]
    });
    res.json(list);
  } catch (error) {
    console.error('Get symptom metadata error:', error);
    res.status(500).json({ error: '자가진단 메타데이터를 조회하는 중 오류 발생.' });
  }
});

// 9. 건강체크 증상 메타데이터 신규 생성
router.post('/symptoms', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { part, partLabel, isInternal, subcategory, symptoms } = req.body;

  if (!part || !partLabel || isInternal === undefined || !subcategory || !symptoms) {
    return res.status(400).json({ error: '필수 데이터가 누락되었습니다.' });
  }

  try {
    const created = await prisma.symptomMetadata.create({
      data: {
        part,
        partLabel,
        isInternal: Boolean(isInternal),
        subcategory,
        symptoms: Array.isArray(symptoms) ? symptoms : symptoms.split(',').map(s => s.trim())
      }
    });
    res.status(201).json(created);
  } catch (error) {
    console.error('Create symptom metadata error:', error);
    res.status(500).json({ error: '자가진단 메타데이터 생성 중 오류 발생.' });
  }
});

// 10. 건강체크 증상 메타데이터 수정
router.put('/symptoms/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { id } = req.params;
  const { part, partLabel, isInternal, subcategory, symptoms } = req.body;

  try {
    const updated = await prisma.symptomMetadata.update({
      where: { id: Number(id) },
      data: {
        part,
        partLabel,
        isInternal: isInternal !== undefined ? Boolean(isInternal) : undefined,
        subcategory,
        symptoms: Array.isArray(symptoms) ? symptoms : symptoms.split(',').map(s => s.trim())
      }
    });
    res.json(updated);
  } catch (error) {
    console.error('Update symptom metadata error:', error);
    res.status(500).json({ error: '자가진단 메타데이터 수정 중 오류 발생.' });
  }
});

// 11. 건강체크 증상 메타데이터 삭제
router.delete('/symptoms/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { id } = req.params;
  try {
    await prisma.symptomMetadata.delete({
      where: { id: Number(id) }
    });
    res.json({ message: '자가진단 메타데이터가 정상 삭제되었습니다.' });
  } catch (error) {
    console.error('Delete symptom metadata error:', error);
    res.status(500).json({ error: '자가진단 메타데이터 삭제 중 오류 발생.' });
  }
});

// 12. 전체 상품 목록 조회 (상세 제품 데이터)
router.get('/products', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const list = await prisma.product.findMany({
      orderBy: { createdAt: 'desc' }
    });
    res.json(list);
  } catch (error) {
    console.error('Get products error:', error);
    res.status(500).json({ error: '상품 목록을 조회하는 중 오류 발생.' });
  }
});

// 13. 상품 등록
router.post('/products', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { name, category, price, stock, sales } = req.body;
  try {
    const created = await prisma.product.create({
      data: {
        name,
        category,
        price: Number(price),
        stock: Number(stock),
        sales: sales ? Number(sales) : 0
      }
    });
    res.status(201).json(created);
  } catch (error) {
    console.error('Create product error:', error);
    res.status(500).json({ error: '상품 등록 중 오류 발생.' });
  }
});

// 14. 상품 정보 수정
router.put('/products/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { id } = req.params;
  const { name, category, price, stock, sales } = req.body;
  try {
    const updated = await prisma.product.update({
      where: { id: Number(id) },
      data: {
        name,
        category,
        price: price !== undefined ? Number(price) : undefined,
        stock: stock !== undefined ? Number(stock) : undefined,
        sales: sales !== undefined ? Number(sales) : undefined
      }
    });
    res.json(updated);
  } catch (error) {
    console.error('Update product error:', error);
    res.status(500).json({ error: '상품 수정 중 오류 발생.' });
  }
});

// 15. 상품 삭제
router.delete('/products/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { id } = req.params;
  try {
    await prisma.product.delete({
      where: { id: Number(id) }
    });
    res.json({ message: '상품이 삭제되었습니다.' });
  } catch (error) {
    console.error('Delete product error:', error);
    res.status(500).json({ error: '상품 삭제 중 오류 발생.' });
  }
});

// 16. 전체 앱 설정 목록 조회
router.get('/configs', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const list = await prisma.appConfig.findMany({
      orderBy: { key: 'asc' }
    });
    res.json(list);
  } catch (error) {
    console.error('Get configs error:', error);
    res.status(500).json({ error: '앱 설정을 가져오는 중 오류 발생.' });
  }
});

// 17. 앱 설정 변경
router.put('/configs/:key', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { key } = req.params;
  const { value } = req.body;
  try {
    const updated = await prisma.appConfig.update({
      where: { key },
      data: { value }
    });
    res.json(updated);
  } catch (error) {
    console.error('Update config error:', error);
    res.status(500).json({ error: '앱 설정 수정 중 오류 발생.' });
  }
});

// 18. 전체 병원 목록 조회
router.get('/hospitals', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const list = await prisma.hospital.findMany({
      orderBy: { createdAt: 'desc' }
    });
    res.json(list);
  } catch (error) {
    console.error('Get hospitals error:', error);
    res.status(500).json({ error: '병원 목록을 조회하는 중 오류 발생.' });
  }
});

// 19. 병원 등록
router.post('/hospitals', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { name, address, phone, departments, rating, status } = req.body;
  try {
    const created = await prisma.hospital.create({
      data: {
        name,
        address,
        phone,
        departments: Array.isArray(departments) ? departments : departments.split(',').map(d => d.trim()),
        rating: rating ? parseFloat(rating) : 5.0,
        status: status || 'active'
      }
    });
    res.status(201).json(created);
  } catch (error) {
    console.error('Create hospital error:', error);
    res.status(500).json({ error: '병원 등록 중 오류 발생.' });
  }
});

// 20. 병원 정보 수정
router.put('/hospitals/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { id } = req.params;
  const { name, address, phone, departments, rating, status } = req.body;
  try {
    const updated = await prisma.hospital.update({
      where: { id: Number(id) },
      data: {
        name,
        address,
        phone,
        departments: departments ? (Array.isArray(departments) ? departments : departments.split(',').map(d => d.trim())) : undefined,
        rating: rating ? parseFloat(rating) : undefined,
        status
      }
    });
    res.json(updated);
  } catch (error) {
    console.error('Update hospital error:', error);
    res.status(500).json({ error: '병원 정보 수정 중 오류 발생.' });
  }
});

// 21. 병원 삭제
router.delete('/hospitals/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { id } = req.params;
  try {
    await prisma.hospital.delete({
      where: { id: Number(id) }
    });
    res.json({ message: '병원이 삭제되었습니다.' });
  } catch (error) {
    console.error('Delete hospital error:', error);
    res.status(500).json({ error: '병원 삭제 중 오류 발생.' });
  }
});

module.exports = router;
