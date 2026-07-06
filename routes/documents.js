const express = require('express');
const prisma = require('../db');
const { authenticateToken, requireRole } = require('../middleware');

const router = express.Router();

// 1. 발급 완료 및 제출된 모든 서류 목록 조회
router.get('/', authenticateToken, async (req, res) => {
  try {
    const documents = await prisma.insuranceDocument.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' }
    });
    res.json(documents);
  } catch (error) {
    console.error('Get documents error:', error);
    res.status(500).json({ error: '서류 목록을 가져오는 중 오류 발생.' });
  }
});

// 2. 새로운 서류 수동/자동 발급 등록 (의사/관리자 전용)
router.post('/', authenticateToken, requireRole(['doctor', 'admin']), async (req, res) => {
  const { documentType, hospitalName, issueDate, fileUrl, userId } = req.body;

  if (!documentType || !hospitalName) {
    return res.status(400).json({ error: '서류 종류와 병원명은 필수 항목입니다.' });
  }

  // 대상 유저 ID가 명시되지 않은 경우 현재 인증된 사용자 ID 사용
  const targetUserId = userId ? Number(userId) : req.user.id;

  try {
    const newDoc = await prisma.insuranceDocument.create({
      data: {
        documentType,
        hospitalName,
        issueDate: issueDate ? new Date(issueDate) : new Date(),
        status: 'issued',
        fileUrl: fileUrl || `/documents/issued_${Date.now()}.pdf`,
        userId: targetUserId
      }
    });

    res.status(201).json(newDoc);
  } catch (error) {
    console.error('Create document error:', error);
    res.status(500).json({ error: '서류 발급 등록 중 오류 발생.' });
  }
});

// 3. 보험사 연결 및 서류 자동/수동 제출
router.post('/:id/submit', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { submittedTo } = req.body; // e.g. '삼성화재', '현대해상'

  if (!submittedTo) {
    return res.status(400).json({ error: '제출할 보험사를 입력해 주세요.' });
  }

  try {
    const doc = await prisma.insuranceDocument.findFirst({
      where: { id: Number(id), userId: req.user.id }
    });

    if (!doc) {
      return res.status(404).json({ error: '서류 정보를 찾을 수 없습니다.' });
    }

    if (doc.status === 'submitted') {
      return res.status(400).json({ error: '이미 제출이 완료된 서류입니다.' });
    }

    const updated = await prisma.insuranceDocument.update({
      where: { id: Number(id) },
      data: {
        status: 'submitted',
        submittedTo
      }
    });

    // 제출 완료 알림 생성
    await prisma.notification.create({
      data: {
        category: 'service',
        title: '보험 청구 서류 제출 완료',
        body: `${doc.hospitalName}에서 발급한 [${doc.documentType}]가 ${submittedTo}에 성공적으로 제출되었습니다.`,
        userId: req.user.id
      }
    });

    res.json(updated);
  } catch (error) {
    console.error('Submit document error:', error);
    res.status(500).json({ error: '보험사 제출 중 오류 발생.' });
  }
});

// 4. 서류 삭제
router.delete('/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;

  try {
    const doc = await prisma.insuranceDocument.findFirst({
      where: { id: Number(id), userId: req.user.id }
    });

    if (!doc) {
      return res.status(404).json({ error: '삭제할 서류를 찾을 수 없습니다.' });
    }

    await prisma.insuranceDocument.delete({
      where: { id: Number(id) }
    });

    res.json({ message: '서류가 정상적으로 삭제되었습니다.' });
  } catch (error) {
    console.error('Delete document error:', error);
    res.status(500).json({ error: '서류 삭제 중 오류 발생.' });
  }
});

module.exports = router;
