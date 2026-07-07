require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const http = require('http');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('./middleware');

// 라우터 모듈 로드
const authRouter = require('./routes/auth');
const gpsRouter = require('./routes/gps');
const reportsRouter = require('./routes/reports');
const telemedicineRouter = require('./routes/telemedicine');
const notificationsRouter = require('./routes/notifications');
const documentsRouter = require('./routes/documents');
const adminRouter = require('./routes/admin');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

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
  res.send('건강 체크 및 안심케어 서비스 API 서버 작동 중! (기능 확장 및 관리자 페이지 연동 완료, Socket.io WebRTC 시그널링 지원)');
});

// 기능별 라우터 등록
app.use('/api/auth', authRouter);
app.use('/api/gps', gpsRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/telemedicine', telemedicineRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/documents', documentsRouter);
app.use('/api/admin', adminRouter);

// ── Socket.io 연결 인증 미들웨어 및 WebRTC 시그널링 로직 ──
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) {
    return next(new Error('인증 토큰이 누락되었습니다.'));
  }
  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      return next(new Error('유효하지 않은 토큰입니다.'));
    }
    socket.user = decoded; // { id, email, role }
    next();
  });
});

io.on('connection', (socket) => {
  console.log(`📡 소켓 접속 완료: SocketID: ${socket.id} | UserID: ${socket.user.id} | Role: ${socket.user.role}`);

  // 1. 진료 고유 룸 조인
  socket.on('join-clinic', ({ sessionId }) => {
    const roomName = `clinic-${sessionId}`;
    socket.join(roomName);
    console.log(`🏥 [Room: ${roomName}] User(${socket.user.id}, Role: ${socket.user.role}) 룸 조인 완료`);

    // 룸 내에 이미 상대방 피어가 있는지 체크하여 연결 신호 개시 유도
    const clientsInRoom = io.sockets.adapter.rooms.get(roomName);
    const size = clientsInRoom ? clientsInRoom.size : 0;
    
    // 2명 이상이 룸에 존재하면 통화 시작 이벤트 트리거
    if (size >= 2) {
      console.log(`🔗 [Room: ${roomName}] 양측 접속 완료 -> 통화 초기화 브로드캐스트`);
      // 룸에 있는 환자와 의사에게 통화 연결 준비 신호 전송
      io.to(roomName).emit('clinic-ready', { sessionId });
    }
  });

  // 2. WebRTC Offer 수신 및 룸 내 다른 멤버에게 1:1 중계
  socket.on('webrtc-offer', ({ offer, sessionId }) => {
    const roomName = `clinic-${sessionId}`;
    socket.to(roomName).emit('webrtc-offer', { offer });
    console.log(`➡️ [Room: ${roomName}] Offer 중계 완료`);
  });

  // 3. WebRTC Answer 수신 및 룸 내 다른 멤버에게 1:1 중계
  socket.on('webrtc-answer', ({ answer, sessionId }) => {
    const roomName = `clinic-${sessionId}`;
    socket.to(roomName).emit('webrtc-answer', { answer });
    console.log(`⬅️ [Room: ${roomName}] Answer 중계 완료`);
  });

  // 4. ICE Candidate (네트워크 후보지) 중계
  socket.on('ice-candidate', ({ candidate, sessionId }) => {
    const roomName = `clinic-${sessionId}`;
    socket.to(roomName).emit('ice-candidate', { candidate });
  });

  // 5. 통화 종료 / 진료방 퇴장
  socket.on('leave-clinic', ({ sessionId }) => {
    const roomName = `clinic-${sessionId}`;
    socket.leave(roomName);
    socket.to(roomName).emit('clinic-closed', { sessionId });
    console.log(`❌ [Room: ${roomName}] User(${socket.user.id}) 룸 퇴장`);
  });

  socket.on('disconnect', () => {
    console.log(`🔌 소켓 접속 종료: SocketID: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`서버 ${PORT}번 포트에서 작동중`);
});
