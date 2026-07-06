require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

// 라우터 모듈 로드
const authRouter = require('./routes/auth');
const gpsRouter = require('./routes/gps');
const reportsRouter = require('./routes/reports');
const telemedicineRouter = require('./routes/telemedicine');
const notificationsRouter = require('./routes/notifications');
const documentsRouter = require('./routes/documents');
const adminRouter = require('./routes/admin');

const app = express();

// 개발 모드 로깅 활성화 (시인성 극대화)
app.use(morgan('dev'));

// 무차별 대입(Brute-Force) 및 DDoS 자원 스팸 공격 방어용 글로벌 제한설정
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15분
  max: 400,                  // 15분당 IP당 최대 400회 요청
  message: { error: '서버에 과도한 요청이 감지되었습니다. 잠시 후 다시 이용해주세요.' },
  standardHeaders: true,
  legacyHeaders: false
});

app.use(cors());
app.use(express.json());
app.use('/api', globalLimiter);

// 정적 파일 서빙 등록 (관리자 웹 대시보드 서빙용)
app.use(express.static('public'));

// 기본 루트 테스트 엔드포인트
app.get('/', (req, res) => {
  res.send('건강 체크 및 안심케어 서비스 API 서버 작동 중! (기능 확장 및 관리자 페이지 연동 완료)');
});

// 기능별 라우터 등록
app.use('/api/auth', authRouter);
app.use('/api/gps', gpsRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/telemedicine', telemedicineRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/documents', documentsRouter);
app.use('/api/admin', adminRouter);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`서버 ${PORT}번 포트에서 작동중`);
});
