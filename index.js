require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('./db');
const { authenticateToken, JWT_SECRET } = require('./middleware');

const app = express();

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('건강 체크 및 안심케어 서비스 API 서버 작동 중!');
});

// ── [1. 회원가입 / 로그인] ──

// 회원가입
app.post('/api/auth/register', async (req, res) => {
  const { email, password, name } = req.value || req.body;
  if (!email || !password || !name) {
    return res.status(400).json({ error: '필수 필드가 누락되었습니다 (email, password, name).' });
  }

  try {
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(409).json({ error: '이미 존재하는 이메일입니다.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
      },
    });

    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    
    // 비밀번호 제외하고 리턴
    const { password: _, ...userWithoutPassword } = user;
    res.status(201).json({ token, user: userWithoutPassword });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: '회원가입 처리 중 오류 발생.' });
  }
});

// 로그인
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: '이메일과 비밀번호를 입력해주세요.' });
  }

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json({ error: '이메일 또는 비밀번호가 불일치합니다.' });
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ error: '이메일 또는 비밀번호가 불일치합니다.' });
    }

    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    
    const { password: _, ...userWithoutPassword } = user;
    res.json({ token, user: userWithoutPassword });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: '로그인 처리 중 오류 발생.' });
  }
});


// ── [2. 내 정보 / 프로필 관리] ──

// 회원 본인 프로필 정보 조회
app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) {
      return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
    }
    const { password: _, ...userWithoutPassword } = user;
    res.json(userWithoutPassword);
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: '프로필 조회 중 오류 발생.' });
  }
});

// 회원 본인 프로필 정보 수정
app.put('/api/auth/me', authenticateToken, async (req, res) => {
  const { name, phone, age, gender, height, weight, profileImage } = req.body;

  try {
    const updatedUser = await prisma.user.update({
      where: { id: req.user.id },
      data: {
        name,
        phone,
        age: age ? Number(age) : undefined,
        gender,
        height: height ? parseFloat(height) : undefined,
        weight: weight ? parseFloat(weight) : undefined,
        profileImage,
      },
    });

    const { password: _, ...userWithoutPassword } = updatedUser;
    res.json(userWithoutPassword);
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: '프로필 업데이트 중 오류 발생.' });
  }
});


// ── [3. 안심 GPS 설정 및 동의 관리] ──

// GPS 보호 대상자 리스트 조회
app.get('/api/gps', authenticateToken, async (req, res) => {
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
app.post('/api/gps', authenticateToken, async (req, res) => {
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
app.put('/api/gps/:id', authenticateToken, async (req, res) => {
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
app.delete('/api/gps/:id', authenticateToken, async (req, res) => {
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


// ── [4. 자가진단 건강 리포트 관리] ──

// 리포트 목록 조회
app.get('/api/reports', authenticateToken, async (req, res) => {
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
app.post('/api/reports', authenticateToken, async (req, res) => {
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


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`서버 ${PORT}번 포트에서 작동중`);
});
