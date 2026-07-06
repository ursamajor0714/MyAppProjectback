const express = require('express');
const prisma = require('../db');
const { authenticateToken } = require('../middleware');

const router = express.Router();

// Haversine distance formula helper
function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Earth radius in meters
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
            Math.cos(phi1) * Math.cos(phi2) *
            Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // distance in meters
}

// 1. GPS 보호 대상자 리스트 조회
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

// 2. GPS 보호 대상자 연동 요청 생성
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

// 3. GPS 대상 설정 업데이트 (수락 시뮬레이션, 위치 갱신 등 포함)
router.put('/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { safetyRadius, stayTimeLimit, selectedIllnesses, connectionStatus, consentGranted, latitude, longitude } = req.body;

  try {
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

// 4. GPS 연동 삭제
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

// 5. GPS 실시간 위치 로그 기록 및 안전지역 이탈 체크
router.post('/:id/logs', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { latitude, longitude, batteryLevel, speed } = req.body;

  if (!latitude || !longitude) {
    return res.status(400).json({ error: '위도(latitude)와 경도(longitude)는 필수 입력 사항입니다.' });
  }

  try {
    const setting = await prisma.gpsSetting.findFirst({
      where: { id: Number(id), guardianId: req.user.id },
    });

    if (!setting) {
      return res.status(404).json({ error: '보호 대상 설정을 찾을 수 없습니다.' });
    }

    // 설정된 중심 좌표가 있는 경우 안전구역 이탈여부 계산
    let isBreached = false;
    if (setting.latitude && setting.longitude) {
      const distance = getDistance(
        parseFloat(latitude),
        parseFloat(longitude),
        setting.latitude,
        setting.longitude
      );
      if (distance > setting.safetyRadius) {
        isBreached = true;
      }
    }

    // 위치 로그 기록
    const gpsLog = await prisma.gpsLog.create({
      data: {
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        batteryLevel: batteryLevel ? Number(batteryLevel) : null,
        speed: speed ? parseFloat(speed) : null,
        isSafetyZoneBreached: isBreached,
        gpsSettingId: setting.id
      }
    });

    // 이탈 시 알림 발송
    if (isBreached) {
      await prisma.notification.create({
        data: {
          category: 'gps',
          title: '안전구역 이탈 발생!',
          body: `보호 대상자가 지정된 안전 반경(${setting.safetyRadius}m)을 벗어났습니다. 현재 위치 확인을 권장합니다.`,
          userId: req.user.id
        }
      });
    }

    res.status(201).json({ gpsLog, isSafetyZoneBreached: isBreached });
  } catch (error) {
    console.error('Log GPS location error:', error);
    res.status(500).json({ error: 'GPS 위치 로그를 기록하는 중 오류 발생.' });
  }
});

// 6. 특정 보호 대상자 위치 로그 이력 조회
router.get('/:id/logs', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { limit } = req.query;

  try {
    const logs = await prisma.gpsLog.findMany({
      where: { gpsSettingId: Number(id) },
      orderBy: { createdAt: 'desc' },
      take: limit ? Number(limit) : 50
    });
    res.json(logs);
  } catch (error) {
    console.error('Get GPS logs error:', error);
    res.status(500).json({ error: 'GPS 경로 로그를 가져오는 중 오류 발생.' });
  }
});

// 7. SOS 긴급 알림 발생
router.post('/:id/sos', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { latitude, longitude } = req.body;

  try {
    const setting = await prisma.gpsSetting.findFirst({
      where: { id: Number(id), guardianId: req.user.id }
    });

    if (!setting) {
      return res.status(404).json({ error: '보호 대상 설정을 찾을 수 없습니다.' });
    }

    // SOS 기록 생성 (전화 및 SMS 발송 시뮬레이션 포함)
    const sosAlert = await prisma.sosAlert.create({
      data: {
        status: 'triggered',
        latitude: latitude ? parseFloat(latitude) : null,
        longitude: longitude ? parseFloat(longitude) : null,
        verificationSmsSent: true,
        verificationCallMade: true,
        gpsSettingId: setting.id
      }
    });

    // 보호자에게 실시간 SOS 푸시 알림 기록 추가
    await prisma.notification.create({
      data: {
        category: 'sos',
        title: '🚨 SOS 긴급 상황 발생!',
        body: `보호 대상자가 긴급 SOS를 요청했습니다. 등록된 보호번호(${setting.targetPhoneNumber})로 연락을 시도하고 긴급 알람을 울립니다.`,
        userId: req.user.id
      }
    });

    res.status(201).json(sosAlert);
  } catch (error) {
    console.error('Trigger SOS error:', error);
    res.status(500).json({ error: 'SOS 긴급 알림 생성 중 오류 발생.' });
  }
});

// 8. SOS 상황 해제
router.post('/:id/sos/resolve', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { sosAlertId } = req.body;

  if (!sosAlertId) {
    return res.status(400).json({ error: '해제할 SOS 경보의 ID가 필요합니다.' });
  }

  try {
    const sosAlert = await prisma.sosAlert.findUnique({
      where: { id: Number(sosAlertId) }
    });

    if (!sosAlert) {
      return res.status(404).json({ error: '해당 SOS 경보를 찾을 수 없습니다.' });
    }

    const updated = await prisma.sosAlert.update({
      where: { id: Number(sosAlertId) },
      data: {
        status: 'resolved',
        resolvedAt: new Date()
      }
    });

    // 해제 알림
    await prisma.notification.create({
      data: {
        category: 'sos',
        title: 'SOS 상황 해제',
        body: '보호 대상자의 SOS 긴급 상황이 정상적으로 해제되었습니다.',
        userId: req.user.id
      }
    });

    res.json(updated);
  } catch (error) {
    console.error('Resolve SOS error:', error);
    res.status(500).json({ error: 'SOS 해제 처리 중 오류 발생.' });
  }
});

module.exports = router;
