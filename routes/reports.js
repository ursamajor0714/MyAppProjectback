const express = require('express');
const prisma = require('../db');
const { authenticateToken } = require('../middleware');

const router = express.Router();

// 리포트 목록 조회
router.get('/', authenticateToken, async (req, res) => {
  try {
    const reports = await prisma.symptomReport.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
    });
    res.json(reports);
  } catch (error) {
    console.error('Get reports error:', error);
    res.status(500).json({ error: '건강 리포트를 가져오는 중 오류 발생.' });
  }
});

// 리포트 생성
router.post('/', authenticateToken, async (req, res) => {
  const { title, content, riskLevel } = req.body;

  if (!title || !content || !riskLevel) {
    return res.status(400).json({ error: '필수 데이터가 누락되었습니다 (title, content, riskLevel).' });
  }

  try {
    const newReport = await prisma.symptomReport.create({
      data: {
        title,
        content,
        riskLevel,
        userId: req.user.id,
      },
    });
    res.status(201).json(newReport);
  } catch (error) {
    console.error('Create report error:', error);
    res.status(500).json({ error: '건강 리포트 저장 중 오류 발생.' });
  }
});

module.exports = router;
