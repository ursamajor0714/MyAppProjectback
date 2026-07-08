const express = require('express');
const prisma = require('../db');
const { authenticateToken } = require('../middleware');

const router = express.Router();

// Mock Doctors Data for different departments
const DEPARTMENTS = [
  '내과', '외과', '이비인후과', '정형외과', '피부과', 
  '정신의학과', '안과', '치과', '산부인과', '비뇨의학과', '재활의학과'
];

const MOCK_DOCTORS = [
  { id: 1, name: '김민준 의사', department: '내과', hospitalName: '서울내과의원', status: '진료중', waitTime: '5분', rating: 4.8 },
  { id: 2, name: '이서연 의사', department: '내과', hospitalName: '행복한내과의원', status: '진료중', waitTime: '15분', rating: 4.9 },
  { id: 3, name: '박준서 의사', department: '소아과', hospitalName: '아이사랑소아과', status: '대기없음', waitTime: '0분', rating: 4.7 },
  { id: 4, name: '최지우 의사', department: '이비인후과', hospitalName: '이편한이비인후과', status: '진료중', waitTime: '10분', rating: 4.6 },
  { id: 5, name: '정다은 의사', department: '피부과', hospitalName: '맑은피부과의원', status: '진료중', waitTime: '20분', rating: 4.9 },
  { id: 6, name: '강현우 의사', department: '정형외과', hospitalName: '튼튼정형외과', status: '학회참석', waitTime: '대기불가', rating: 4.5 },
];

// 0. 진료 내역 조회 (완료된 세션 목록 - 마이페이지 보험 청구 화면용)
router.get('/sessions/history', authenticateToken, async (req, res) => {
  try {
    const sessions = await prisma.telemedicineSession.findMany({
      where: {
        userId: req.user.id,
        status: { in: ['completed', 'cancelled'] },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    // 마이페이지 보험청구 UI 포맷으로 가공
    const formatted = sessions.map((s) => ({
      id: `T-${String(s.id).padStart(8, '0')}`,
      sessionId: s.id,
      hospital: s.hospitalName,
      doctor: s.doctorName,
      department: s.department,
      date: s.createdAt.toISOString().split('T')[0],
      diagnosis: s.symptomDetails || '진료 내역',
      cost: s.billAmount ? `${s.billAmount.toLocaleString('ko-KR')}원` : '미청구',
      paid: s.paid,
      status: s.status,
      prescriptionUrl: s.prescriptionUrl || null,
    }));

    res.json(formatted);
  } catch (error) {
    console.error('Get telemedicine history error:', error);
    res.status(500).json({ error: '진료 내역을 가져오는 중 오류 발생.' });
  }
});

// 1. 진료과 및 의사 목록 조회
router.get('/doctors', authenticateToken, async (req, res) => {
  const { department } = req.query;
  try {
    let doctors = MOCK_DOCTORS;
    if (department) {
      doctors = MOCK_DOCTORS.filter(d => d.department === department);
    }
    res.json({
      departments: DEPARTMENTS,
      doctors
    });
  } catch (error) {
    console.error('Get doctors error:', error);
    res.status(500).json({ error: '의사 목록을 가져오는 중 오류 발생.' });
  }
});

// 임시: 모든 활성 진료 취소 엔드포인트 (테스트용)
router.post('/sessions/clear-all', async (req, res) => {
  try {
    const result = await prisma.telemedicineSession.updateMany({
      where: {
        status: { in: ['waiting', 'ongoing'] }
      },
      data: {
        status: 'cancelled',
        waitQueueNumber: null
      }
    });
    res.json({ message: `Successfully updated ${result.count} sessions to cancelled.` });
  } catch (error) {
    console.error('Clear all sessions error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 2. 비대면 진료 세션 생성 (진료 신청 및 대기열 등록)
router.post('/sessions', authenticateToken, async (req, res) => {
  const { doctorName, department, hospitalName, symptomDetails } = req.body;

  if (!doctorName || !department || !hospitalName) {
    return res.status(400).json({ error: '의사명, 진료과, 병원명은 필수 항목입니다.' });
  }

  try {
    // 진행중이거나 대기중인 기존 세션이 있는지 확인
    const activeSession = await prisma.telemedicineSession.findFirst({
      where: {
        userId: req.user.id,
        status: { in: ['waiting', 'ongoing'] }
      }
    });

    if (activeSession) {
      return res.status(400).json({ error: '이미 대기중이거나 진행중인 비대면 진료가 있습니다.' });
    }

    // 동일 의사의 대기자 수 계산하여 대기 번호 생성
    const waitingCount = await prisma.telemedicineSession.count({
      where: {
        doctorName,
        status: 'waiting'
      }
    });

    const newSession = await prisma.telemedicineSession.create({
      data: {
        doctorName,
        department,
        hospitalName,
        status: 'waiting',
        symptomDetails,
        waitQueueNumber: waitingCount + 1,
        userId: req.user.id
      }
    });

    // 시스템 기본 알림 추가
    await prisma.notification.create({
      data: {
        category: 'clinic',
        title: '비대면 진료 대기 등록',
        body: `${hospitalName} ${doctorName} 진료 대기가 접수되었습니다. 대기 번호: ${waitingCount + 1}번`,
        userId: req.user.id
      }
    });

    res.status(201).json(newSession);
  } catch (error) {
    console.error('Create telemedicine session error:', error);
    res.status(500).json({ error: '비대면 진료 신청 중 오류 발생.' });
  }
});

// 3. 사용자 활성 진료 세션 상태 조회
router.get('/sessions/active', authenticateToken, async (req, res) => {
  try {
    const session = await prisma.telemedicineSession.findFirst({
      where: {
        userId: req.user.id,
        status: { in: ['waiting', 'ongoing'] }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json(session || null);
  } catch (error) {
    console.error('Get active session error:', error);
    res.status(500).json({ error: '진료 상태 조회 중 오류 발생.' });
  }
});

// 4. 진료 세션 강제 상태 업데이트 (의사 수락 시뮬레이션, 완료, 처방전 발급 등)
router.put('/sessions/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { status, prescriptionUrl, prescriptionSentTo, billAmount, paid } = req.body;

  try {
    const isDoctorOrAdmin = req.user.role === 'doctor' || req.user.role === 'admin';
    const session = await prisma.telemedicineSession.findFirst({
      where: isDoctorOrAdmin
        ? { id: Number(id) }
        : { id: Number(id), userId: req.user.id }
    });

    if (!session) {
      return res.status(404).json({ error: '진료 세션을 찾을 수 없습니다.' });
    }

    // 보안 필터링: 의사/관리자가 아닌 일반 환자는 billAmount, paid 정보를 직접 수정할 수 없으며 status도 'cancelled' 외로는 수정 불가
    if (!isDoctorOrAdmin) {
      if (billAmount !== undefined || paid !== undefined || (status !== undefined && status !== 'cancelled')) {
        return res.status(403).json({ error: '수납 정보 및 진료 상태를 임의로 조작할 권한이 없습니다. (의사/관리자 전용)' });
      }
    }

    const updated = await prisma.telemedicineSession.update({
      where: { id: Number(id) },
      data: {
        status,
        prescriptionUrl,
        prescriptionSentTo,
        billAmount: billAmount ? parseFloat(billAmount) : undefined,
        paid: paid !== undefined ? Boolean(paid) : undefined,
        // 완료 시 대기번호 제거
        waitQueueNumber: status === 'completed' || status === 'cancelled' ? null : undefined
      }
    });

    // 알림 메시지 발송 조건 처리
    if (status === 'ongoing' && session.status !== 'ongoing') {
      await prisma.notification.create({
        data: {
          category: 'clinic',
          title: '비대면 진료 시작',
          body: `${session.doctorName}의 진료실로 입장하세요.`,
          userId: session.userId
        }
      });
    } else if (status === 'completed' && session.status !== 'completed') {
      await prisma.notification.create({
        data: {
          category: 'clinic',
          title: '진료 완료 및 수납 안내',
          body: `${session.doctorName}의 진료가 완료되었습니다. 처방전이 발송되었으며 진료비가 후청구됩니다.`,
          userId: session.userId
        }
      });

      // 보험 제출이 용이하도록 자동으로 InsuranceDocument에 처방전 연동
      if (prescriptionUrl) {
        await prisma.insuranceDocument.create({
          data: {
            documentType: '처방전',
            hospitalName: session.hospitalName,
            issueDate: new Date(),
            status: 'issued',
            fileUrl: prescriptionUrl,
            userId: session.userId
          }
        });
      }
    }

    res.json(updated);
  } catch (error) {
    console.error('Update session error:', error);
    res.status(500).json({ error: '진료 세션 업데이트 중 오류 발생.' });
  }
});

// 5. 진료비 결제 (후청구 결제 처리)
router.post('/sessions/:id/pay', authenticateToken, async (req, res) => {
  const { id } = req.params;

  try {
    const session = await prisma.telemedicineSession.findFirst({
      where: { id: Number(id), userId: req.user.id }
    });

    if (!session) {
      return res.status(404).json({ error: '진료 세션을 찾을 수 없습니다.' });
    }

    if (session.paid) {
      return res.status(400).json({ error: '이미 수납이 완료된 진료입니다.' });
    }

    // 환자가 등록한 간편결제 카드 가져오기
    const userCard = await prisma.creditCard.findFirst({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'asc' }
    });

    const billAmt = session.billAmount || 8400;
    const cardInfo = userCard 
      ? `${userCard.company} (${userCard.number})` 
      : '등록된 간편결제 카드';

    // 💳 [PortOne PG사 후청구 수납 승인 로그]
    console.log(`
    [PortOne 후청구 수납 완료]
    ──────────────────────────────────────────────
    - 환자 ID: ${req.user.id} (${req.user.name})
    - 자동 결제수단: ${cardInfo}
    - 후청구 금액: ${billAmt.toLocaleString()}원
    - 병원명: ${session.hospitalName} (${session.department})
    - 상태: 진료 세션 자동 수납 완료.
    ──────────────────────────────────────────────
    `);

    const updated = await prisma.telemedicineSession.update({
      where: { id: Number(id) },
      data: { paid: true }
    });

    // 수납 확인서 발급 자동화
    await prisma.insuranceDocument.create({
      data: {
        documentType: '의료영수증',
        hospitalName: session.hospitalName,
        issueDate: new Date(),
        status: 'issued',
        fileUrl: `/receipts/receipt_${id}.pdf`,
        userId: req.user.id
      }
    });

    // 알림 전송
    await prisma.notification.create({
      data: {
        category: 'service',
        title: '💳 진료비 후청구 결제 완료',
        body: `${session.hospitalName} 진료비 ${billAmt.toLocaleString()}원이 등록된 카드 [${cardInfo}]로 정상 자동 결제되었습니다. 영수증이 마이페이지에 보관되었습니다.`,
        userId: req.user.id
      }
    });

    res.json(updated);
  } catch (error) {
    console.error('Pay session bill error:', error);
    res.status(500).json({ error: '진료비 결제 처리 중 오류 발생.' });
  }
});

module.exports = router;
