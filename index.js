require('dotenv').config();
const express = require('express');
const cors = require('cors');

// 라우터 모듈 로드
const authRouter = require('./routes/auth');
const gpsRouter = require('./routes/gps');
const reportsRouter = require('./routes/reports');

const app = express();

app.use(cors());
app.use(express.json());

// 기본 루트 테스트 엔드포인트
app.get('/', (req, res) => {
  res.send('건강 체크 및 안심케어 서비스 API 서버 작동 중! (모듈화 완료)');
});

// 기능별 라우터 등록
app.use('/api/auth', authRouter);
app.use('/api/gps', gpsRouter);
app.use('/api/reports', reportsRouter);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`서버 ${PORT}번 포트에서 작동중`);
});
