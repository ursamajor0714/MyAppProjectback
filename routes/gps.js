const express = require('express');
const prisma = require('../db');
const { authenticateToken } = require('../middleware');

const router = express.Router();

// GPS 보호 대상자 리스트 조회
router.get('/', authenticateToken, async (req, res) => {
  try {
    const settings = await prisma.gpsSetting.findMany({
      where: { guardianId: req.user.id },
      orderBy: { createdAt: 'desc' },
    });
    res.json(settings);
  } catch (error) {
    console.error('Get GPS settings error:', error);
    res.status(500).json({ error: 'GPS 설정을 가져오는 중 오류 발생.' });
  }
});

// GPS 보호 대상자 연동 요청 생성
router.post('/', authenticateToken, async (req, res) => {
  const { targetType, targetAge, safetyRadius, stayTimeLimit, selectedIllnesses, targetPhoneNumber, connectionStatus } = req.body;

  if (!targetPhoneNumber || !targetType || !targetAge) {
    return res.status(400).json({ error: '필수 입력 항목(targetType, targetAge, targetPhoneNumber)이 누락되었습니다.' });
  }

  try {
    const newGpsSetting = await prisma.gpsSetting.create({
      data: {
        targetType,
        targetAge: Number(targetAge),
        safetyRadius: safetyRadius ? Number(safetyRadius) : 300,
        stayTimeLimit: stayTimeLimit || '2시간',
        selectedIllnesses: selectedIllnesses || [],
        targetPhoneNumber,
        connectionStatus: connectionStatus || 'pending',
        guardianId: req.user.id,
      },
    });
    res.status(201).json(newGpsSetting);
  } catch (error) {
    console.error('Create GPS setting error:', error);
    res.status(500).json({ error: 'GPS 연동 생성 중 오류 발생.' });
  }
});

// GPS 대상 설정 업데이트 (수락 시뮬레이션, 위치 갱신 등 포함)
router.put('/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { safetyRadius, stayTimeLimit, selectedIllnesses, connectionStatus, consentGranted, latitude, longitude } = req.body;

  try {
    // 본인의 보호 대상자인지 먼저 체크
    const existing = await prisma.gpsSetting.findFirst({
      where: { id: Number(id), guardianId: req.user.id },
    });

    if (!existing) {
      return res.status(404).json({ error: '보호 대상 정보 설정을 찾을 수 없거나 권한이 없습니다.' });
    }

    const updated = await prisma.gpsSetting.update({
      where: { id: Number(id) },
      data: {
        safetyRadius: safetyRadius ? Number(safetyRadius) : undefined,
        stayTimeLimit,
        selectedIllnesses,
        connectionStatus,
        consentGranted: consentGranted !== undefined ? Boolean(consentGranted) : undefined,
        latitude: latitude ? parseFloat(latitude) : undefined,
        longitude: longitude ? parseFloat(longitude) : undefined,
      },
    });

    res.json(updated);
  } catch (error) {
    console.error('Update GPS setting error:', error);
    res.status(500).json({ error: 'GPS 설정 업데이트 중 오류 발생.' });
  }
});

// GPS 연동 삭제
router.delete('/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;

  try {
    const existing = await prisma.gpsSetting.findFirst({
      where: { id: Number(id), guardianId: req.user.id },
    });

    if (!existing) {
      return res.status(404).json({ error: '보호 대상 정보를 찾을 수 없거나 권한이 없습니다.' });
    }

    await prisma.gpsSetting.delete({ where: { id: Number(id) } });
    res.json({ message: '성공적으로 안심 연동을 해제했습니다.' });
  } catch (error) {
    console.error('Delete GPS setting error:', error);
    res.status(500).json({ error: 'GPS 연동 해제 중 오류 발생.' });
  }
});

module.exports = router;
