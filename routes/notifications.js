const express = require('express');
const prisma = require('../db');
const { authenticateToken } = require('../middleware');

const router = express.Router();

// 1. 알림 로그 조회 (전체 / 카테고리별 필터링 - 어드민은 전체 수집)
router.get('/', authenticateToken, async (req, res) => {
  const { category } = req.query;
  try {
    const whereClause = {
      category: category || undefined,
    };
    if (req.user.role !== 'admin') {
      whereClause.userId = req.user.id;
    }
    const notifications = await prisma.notification.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { name: true, email: true } }
      }
    });
    res.json(notifications);
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ error: '알림 내역을 조회하는 중 오류 발생.' });
  }
});

// 2. 알림 읽음 처리 (어드민은 다른 사용자 알림도 읽음처리 가능)
router.put('/:id/read', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const whereClause = { id: Number(id) };
    if (req.user.role !== 'admin') {
      whereClause.userId = req.user.id;
    }
    const notif = await prisma.notification.findFirst({
      where: whereClause,
    });

    if (!notif) {
      return res.status(404).json({ error: '알림을 찾을 수 없습니다.' });
    }

    const updated = await prisma.notification.update({
      where: { id: Number(id) },
      data: { isRead: true },
    });

    res.json(updated);
  } catch (error) {
    console.error('Read notification error:', error);
    res.status(500).json({ error: '알림 읽음 처리 중 오류 발생.' });
  }
});

// 3. 알림 전체 읽음 처리
router.post('/read-all', authenticateToken, async (req, res) => {
  try {
    const whereClause = { isRead: false };
    if (req.user.role !== 'admin') {
      whereClause.userId = req.user.id;
    }
    await prisma.notification.updateMany({
      where: whereClause,
      data: { isRead: true },
    });
    res.json({ message: '모든 알림을 읽음 처리했습니다.' });
  } catch (error) {
    console.error('Read all notifications error:', error);
    res.status(500).json({ error: '전체 알림 읽음 처리 중 오류 발생.' });
  }
});

// 4. 복약 알림 목록 조회
router.get('/medications', authenticateToken, async (req, res) => {
  try {
    const alarms = await prisma.medicationAlarm.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
    });
    res.json(alarms);
  } catch (error) {
    console.error('Get medication alarms error:', error);
    res.status(500).json({ error: '복약 알림 목록을 가져오는 중 오류 발생.' });
  }
});

// 5. 복약 알림 생성
router.post('/medications', authenticateToken, async (req, res) => {
  const { medicineName, dosage, times, days } = req.body;

  if (!medicineName || !times || !Array.isArray(times)) {
    return res.status(400).json({ error: '약물 이름과 알림 시간대(배열)는 필수 항목입니다.' });
  }

  try {
    const alarm = await prisma.medicationAlarm.create({
      data: {
        medicineName,
        dosage,
        times,
        days: days || [],
        userId: req.user.id,
      },
    });

    // 복약 등록 알림 추가
    await prisma.notification.create({
      data: {
        category: 'medication',
        title: '복약 알림 등록',
        body: `새로운 복약 알림이 등록되었습니다: ${medicineName} (${times.join(', ')})`,
        userId: req.user.id,
      },
    });

    res.status(201).json(alarm);
  } catch (error) {
    console.error('Create medication alarm error:', error);
    res.status(500).json({ error: '복약 알림 생성 중 오류 발생.' });
  }
});

// 6. 복약 알림 수정
router.put('/medications/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { medicineName, dosage, times, days, active } = req.body;

  try {
    const alarm = await prisma.medicationAlarm.findFirst({
      where: { id: Number(id), userId: req.user.id },
    });

    if (!alarm) {
      return res.status(404).json({ error: '복약 설정을 찾을 수 없습니다.' });
    }

    const updated = await prisma.medicationAlarm.update({
      where: { id: Number(id) },
      data: {
        medicineName,
        dosage,
        times,
        days,
        active: active !== undefined ? Boolean(active) : undefined,
      },
    });

    res.json(updated);
  } catch (error) {
    console.error('Update medication alarm error:', error);
    res.status(500).json({ error: '복약 알림 수정 중 오류 발생.' });
  }
});

// 7. 복약 알림 삭제
router.delete('/medications/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;

  try {
    const alarm = await prisma.medicationAlarm.findFirst({
      where: { id: Number(id), userId: req.user.id },
    });

    if (!alarm) {
      return res.status(404).json({ error: '복약 설정을 찾을 수 없습니다.' });
    }

    await prisma.medicationAlarm.delete({
      where: { id: Number(id) },
    });

    res.json({ message: '복약 알림이 성공적으로 삭제되었습니다.' });
  } catch (error) {
    console.error('Delete medication alarm error:', error);
    res.status(500).json({ error: '복약 알림 삭제 중 오류 발생.' });
  }
});

module.exports = router;
