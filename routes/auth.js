const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const { StatusCodes } = require('http-status-codes');
const prisma = require('../db');
const { authenticateToken, JWT_SECRET } = require('../middleware');

const router = express.Router();

// 무차별 대입 및 서비스 스팸 방지용 Rate Limiter 설정
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15분
  max: 50,                  // IP당 15분간 최대 50회 요청 가능
  message: { error: '너무 많은 요청이 발생했습니다. 15분 후에 다시 시도해주세요.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Zod 유효성 검증 스키마 정의 (선언형 필터링)
const registerSchema = z.object({
  email: z.string().email('유효하지 않은 이메일 형식입니다.'),
  password: z.string().min(4, '비밀번호는 최소 4글자 이상 입력하세요.'),
  name: z.string().min(2, '이름은 최소 2글자 이상 입력하세요.'),
  role: z.string().optional()
});

const loginSchema = z.object({
  email: z.string().email('유효하지 않은 이메일 형식입니다.'),
  password: z.string().min(1, '비밀번호를 입력해 주세요.')
});

const profileUpdateSchema = z.object({
  name: z.string().optional(),
  phone: z.string().optional().nullable(),
  age: z.preprocess(val => (val === '' || val === null) ? undefined : Number(val), z.number().optional()),
  gender: z.string().optional().nullable(),
  height: z.preprocess(val => (val === '' || val === null) ? undefined : Number(val), z.number().optional()),
  weight: z.preprocess(val => (val === '' || val === null) ? undefined : Number(val), z.number().optional()),
  profileImage: z.string().optional().nullable()
});

// 0. 이메일 중복 체크 API
router.get('/check-email', async (req, res) => {
  const { email } = req.query;
  if (!email) {
    return res.status(StatusCodes.BAD_REQUEST).json({ error: '이메일을 입력해 주세요.' });
  }
  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (user) {
      return res.status(StatusCodes.CONFLICT).json({ error: '이미 사용 중인 이메일입니다.', duplicate: true });
    }
    return res.status(StatusCodes.OK).json({ message: '사용 가능한 이메일입니다.', duplicate: false });
  } catch (e) {
    console.error('Check email error:', e);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error: '이메일 중복 체크 중 오류 발생.' });
  }
});

// 1. 회원가입
router.post('/register', authLimiter, async (req, res) => {
  try {
    // Zod 검증
    const parsedData = registerSchema.parse(req.body);
    const { email, password, name, role } = parsedData;

    // 외부 위협 방지: 의사(doctor)나 최고관리자(admin) 계정 등록은 기존 최고관리자의 인가가 필요함
    let userRole = 'patient';
    if (role === 'doctor' || role === 'admin') {
      const authHeader = req.headers['authorization'];
      const token = authHeader && authHeader.split(' ')[1];
      if (token) {
        try {
          const decoded = jwt.verify(token, JWT_SECRET);
          if (decoded.role === 'admin') {
            userRole = role;
          }
        } catch (err) {
          // 인가 실패 시 일반 환자로 안전 격하
        }
      }
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(StatusCodes.CONFLICT).json({ error: '이미 존재하는 이메일입니다.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
        role: userRole,
      },
    });

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role }, 
      JWT_SECRET, 
      { expiresIn: '7d' }
    );
    
    const { password: _, ...userWithoutPassword } = user;
    res.status(StatusCodes.CREATED).json({ token, user: userWithoutPassword });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(StatusCodes.BAD_REQUEST).json({ error: error.errors[0].message });
    }
    console.error('Register error:', error);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error: '회원가입 처리 중 오류 발생.' });
  }
});

// 2. 로그인
router.post('/login', authLimiter, async (req, res) => {
  try {
    const parsedData = loginSchema.parse(req.body);
    const { email, password } = parsedData;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(StatusCodes.UNAUTHORIZED).json({ error: '이메일 또는 비밀번호가 일치하지 않습니다.' });
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(StatusCodes.UNAUTHORIZED).json({ error: '이메일 또는 비밀번호가 일치하지 않습니다.' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role }, 
      JWT_SECRET, 
      { expiresIn: '7d' }
    );
    
    const { password: _, ...userWithoutPassword } = user;
    res.status(StatusCodes.OK).json({ token, user: userWithoutPassword });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(StatusCodes.BAD_REQUEST).json({ error: error.errors[0].message });
    }
    console.error('Login error:', error);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error: '로그인 처리 중 오류 발생.' });
  }
});

// 3. 프로필 조회
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) {
      return res.status(StatusCodes.NOT_FOUND).json({ error: '사용자를 찾을 수 없습니다.' });
    }
    const { password: _, ...userWithoutPassword } = user;
    res.status(StatusCodes.OK).json(userWithoutPassword);
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error: '프로필 조회 중 오류 발생.' });
  }
});

// 4. 프로필 수정
router.put('/me', authenticateToken, async (req, res) => {
  try {
    const parsedData = profileUpdateSchema.parse(req.body);
    const { name, phone, age, gender, height, weight, profileImage } = parsedData;

    const updatedUser = await prisma.user.update({
      where: { id: req.user.id },
      data: {
        name,
        phone,
        age,
        gender,
        height,
        weight,
        profileImage,
      },
    });

    const { password: _, ...userWithoutPassword } = updatedUser;
    res.status(StatusCodes.OK).json(userWithoutPassword);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(StatusCodes.BAD_REQUEST).json({ error: error.errors[0].message });
    }
    console.error('Update profile error:', error);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error: '프로필 업데이트 중 오류 발생.' });
  }
});

module.exports = router;
