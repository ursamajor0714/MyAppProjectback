require('dotenv').config();
const bcrypt = require('bcryptjs');
const prisma = require('./db');

async function seedDummyData() {
  console.log('🧹 기존 데이터베이스 정리 중...');
  try {
    await prisma.notification.deleteMany();
    await prisma.sosAlert.deleteMany();
    await prisma.gpsLog.deleteMany();
    await prisma.gpsSetting.deleteMany();
    await prisma.insuranceDocument.deleteMany();
    await prisma.telemedicineSession.deleteMany();
    await prisma.medicationAlarm.deleteMany();
    await prisma.symptomReport.deleteMany();
    await prisma.product.deleteMany();
    await prisma.hospital.deleteMany(); // 병원 테이블 클리어 추가
    await prisma.appConfig.deleteMany();
    await prisma.user.deleteMany();

    console.log('✅ 데이터베이스 정리 완료.');

    // 1. AppConfig 시드 등록
    console.log('⚙️ 시스템 설정(AppConfig) 시딩 시작...');
    const configs = [
      { key: 'telemedicine_base_fee', value: '5000', description: '비대면 진료 기본 본인부담금 수납비 (원)' },
      { key: 'gps_refresh_interval', value: '30', description: '안심 GPS 백그라운드 위경도 좌표 수집 간격 (초)' },
      { key: 'sos_siren_volume', value: '100', description: 'SOS 비상 싸이렌 강제 출력 최대 볼륨 (%)' },
      { key: 'free_tier_ad_enabled', value: 'true', description: '무료 등급 환자 앱 광고 배너 활성화 여부' },
      { key: 'insurance_automatic_fax', value: 'true', description: '진료 즉시 지정 보험사 청구서류 팩스/메일 자동 전송 여부' }
    ];
    for (const c of configs) {
      await prisma.appConfig.create({ data: c });
    }

    // 2. Product (스토어 상품 15종) 시딩
    console.log('🛒 스토어 상품 목록 시딩 시작...');
    const products = [
      { name: '데일리 멀티비타민 90정', category: '영양제', price: 18900, stock: 120, sales: 64 },
      { name: '가정용 스마트 자동 혈압계', category: '측정기', price: 55000, stock: 45, sales: 42 },
      { name: '루테인 눈건강 60캡슐', category: '영양제', price: 21900, stock: 85, sales: 38 },
      { name: '스마트 체온계 (비접촉)', category: '측정기', price: 39000, stock: 62, sales: 31 },
      { name: '손목 관절 보호대', category: '보조기', price: 12000, stock: 150, sales: 29 },
      { name: '초고농축 오메가3 크릴오일 60캡슐', category: '영양제', price: 27900, stock: 110, sales: 55 },
      { name: '휴대용 펄스 산소포화도 측정기', category: '측정기', price: 29800, stock: 40, sales: 18 },
      { name: '관절염 무릎 온열 전기 마사지 밴드', category: '보조기', price: 89000, stock: 35, sales: 22 },
      { name: '고함량 비타민D3 5000IU 120정', category: '영양제', price: 15900, stock: 200, sales: 98 },
      { name: '스마트 인바디 체성분 분석 체중계', category: '측정기', price: 34000, stock: 78, sales: 44 },
      { name: '목 견인 자세 교정기 (물리치료기)', category: '보조기', price: 45000, stock: 50, sales: 15 },
      { name: '유산균 프로바이오틱스 100억 CFU', category: '영양제', price: 24500, stock: 95, sales: 50 },
      { name: '어르신 안심 미끄럼방지 4발 지팡이', category: '보조기', price: 28000, stock: 100, sales: 12 },
      { name: '아동용 스마트 방수 네임링 GPS 태그', category: '측정기', price: 19900, stock: 180, sales: 67 },
      { name: '노인 요양 고급 입는 기저귀 30매', category: '보조기', price: 32000, stock: 60, sales: 25 }
    ];
    for (const p of products) {
      await prisma.product.create({ data: p });
    }

    // 3. User (관리자, 환자 3명, 의사 2명) 시딩
    console.log('👤 사용자 계정 시딩 시작...');
    const hashedAdminPassword = await bcrypt.hash('admin1234', 10);
    const hashedUserPassword = await bcrypt.hash('password123', 10);

    // 3-1. 최고관리자
    const admin = await prisma.user.create({
      data: {
        email: 'admin@example.com',
        name: '최고관리자',
        password: hashedAdminPassword,
        role: 'admin',
        phone: '010-0000-0000',
        age: 35,
        gender: '남성'
      }
    });

    // 3-2. 환자들
    const patient1 = await prisma.user.create({
      data: {
        email: 'user1@example.com',
        name: '김순이',
        password: hashedUserPassword,
        role: 'patient',
        phone: '010-1234-5678',
        age: 78,
        gender: '여성',
        height: 152.4,
        weight: 51.5
      }
    });

    const patient2 = await prisma.user.create({
      data: {
        email: 'user2@example.com',
        name: '이철수',
        password: hashedUserPassword,
        role: 'patient',
        phone: '010-9876-5432',
        age: 8,
        gender: '남성',
        height: 126.5,
        weight: 28.0
      }
    });

    const patient3 = await prisma.user.create({
      data: {
        email: 'user3@example.com',
        name: '박성민',
        password: hashedUserPassword,
        role: 'patient',
        phone: '010-3333-4444',
        age: 45,
        gender: '남성',
        height: 178.2,
        weight: 79.4
      }
    });

    // 3-2-1. 지정 피보호자 아동 계정 (실 테스트 용도)
    const patient4 = await prisma.user.create({
      data: {
        email: 'testward@example.com',
        name: '이아동',
        password: hashedUserPassword,
        role: 'patient',
        phone: '010-2990-7152',
        age: 10,
        gender: '남성',
        height: 135.5,
        weight: 32.4
      }
    });

    // 3-3. 의사들 (면허 및 병원 과목 연동 추가)
    const doctor1 = await prisma.user.create({
      data: {
        email: 'doctor1@example.com',
        name: '정성우',
        password: hashedUserPassword,
        role: 'doctor',
        phone: '010-1111-2222',
        age: 42,
        gender: '남성',
        department: '내과',
        hospitalName: '행복한내과의원',
        doctorLicense: 'LIC-100223'
      }
    });

    const doctor2 = await prisma.user.create({
      data: {
        email: 'doctor2@example.com',
        name: '오세은',
        password: hashedUserPassword,
        role: 'doctor',
        phone: '010-5555-6666',
        age: 38,
        gender: '여성',
        department: '소아청소년과',
        hospitalName: '든든한소아과',
        doctorLicense: 'LIC-200984'
      }
    });

    // 3-4. 병원(Hospital) 원장 리스트 시딩
    console.log('🏥 병원 정보 시딩...');
    await prisma.hospital.create({
      data: {
        name: '행복한내과의원',
        address: '서울시 중구 세종대로 110',
        phone: '02-123-4567',
        departments: ['내과', '순환기내과', '가정의학과'],
        rating: 4.8,
        status: 'active'
      }
    });

    await prisma.hospital.create({
      data: {
        name: '든든한소아과',
        address: '서울시 종로구 대학로 101',
        phone: '02-765-4321',
        departments: ['소아청소년과', '소아과'],
        rating: 4.9,
        status: 'active'
      }
    });

    await prisma.hospital.create({
      data: {
        name: '서울이비인후과의원',
        address: '서울시 마포구 독막로 50',
        phone: '02-333-7777',
        departments: ['이비인후과', '이비인후외과'],
        rating: 4.5,
        status: 'inactive'
      }
    });

    // 4. 복약 알림 (Medication Alarm)
    console.log('💊 복약 알림 시딩...');
    await prisma.medicationAlarm.create({
      data: {
        medicineName: '고혈압약 (아모디핀)',
        dosage: '1정',
        times: ['08:30'],
        days: ['월', '화', '수', '목', '금', '토', '일'],
        active: true,
        userId: patient1.id
      }
    });
    await prisma.medicationAlarm.create({
      data: {
        medicineName: '오메가3 영양제',
        dosage: '2캡슐',
        times: ['13:00'],
        days: ['월', '수', '금'],
        active: true,
        userId: patient3.id
      }
    });

    // 5. 자가진단 기록 (Symptom Report)
    console.log('📋 자가진단 기록 시딩...');
    const report1 = await prisma.symptomReport.create({
      data: {
        title: '머리 내부 찌르는 통증 (극심)',
        riskLevel: 'high',
        content: {
          part: 'head',
          partLabel: '머리',
          isInternal: true,
          subcategory: 'stabbing',
          selectedSymptoms: ['극심한 두통', '송곳으로 찌르는 통증'],
          intensity: 8,
          duration: '3시간째 지속'
        },
        userId: patient1.id
      }
    });

    const report2 = await prisma.symptomReport.create({
      data: {
        title: '가슴 쥐어짜는 듯한 흉통',
        riskLevel: 'very_high',
        content: {
          part: 'chest',
          partLabel: '가슴',
          isInternal: true,
          subcategory: 'squeezing',
          selectedSymptoms: ['호흡 곤란 및 가슴 통증', '심장이 쥐어짜는 듯한 압박'],
          intensity: 10,
          duration: '15분 전부터 발작'
        },
        userId: patient1.id
      }
    });

    const report3 = await prisma.symptomReport.create({
      data: {
        title: '복부 가스참 및 소화 장애',
        riskLevel: 'medium',
        content: {
          part: 'abdomen',
          partLabel: '복부',
          isInternal: true,
          subcategory: 'bloating',
          selectedSymptoms: ['복부 팽만감 및 가스 참', '소화불량 및 더부룩함'],
          intensity: 4,
          duration: '1일 동안 유지'
        },
        userId: patient3.id
      }
    });

    // 6. 비대면 진료 세션 (Telemedicine Session)
    console.log('🩺 비대면 진료 세션 시딩...');
    // 6-1. 대기중 (Waiting)
    await prisma.telemedicineSession.create({
      data: {
        status: 'waiting',
        hospitalName: '행복한내과의원',
        doctorName: '정성우',
        department: '순환기내과',
        symptomDetails: '어제 저녁부터 왼쪽 가슴 부위가 뻐근하고 무거운 짐을 올려놓은 것처럼 답답한 흉통이 느껴집니다.',
        userId: patient1.id
      }
    });

    // 6-2. 진행중 (Ongoing)
    await prisma.telemedicineSession.create({
      data: {
        status: 'ongoing',
        hospitalName: '든든한소아과',
        doctorName: '오세은',
        department: '소아청소년과',
        symptomDetails: '아이가 낮에 놀이터에서 놀고 들어온 후 갑자기 귀 뒤쪽 림프선 멍울 통증과 미열을 호소합니다.',
        userId: patient2.id
      }
    });

    // 6-3. 완료 및 수납 완료 (Completed & Paid)
    const sessionCompleted = await prisma.telemedicineSession.create({
      data: {
        status: 'completed',
        hospitalName: '행복한내과의원',
        doctorName: '정성우',
        department: '내과',
        symptomDetails: '속쓰림과 명치 통증이 심해 역류성 식도염 약 처방 원합니다.',
        billAmount: 5200,
        paid: true,
        prescriptionSentTo: 'fax: 02-9988-7766',
        prescriptionUrl: '/prescriptions/pres_completed_01.pdf',
        userId: patient3.id
      }
    });

    // 완료된 건의 보험 서류 생성
    await prisma.insuranceDocument.create({
      data: {
        documentType: '소견서',
        hospitalName: '행복한내과의원',
        issueDate: new Date(),
        status: 'submitted',
        submittedTo: '삼성화재',
        userId: patient3.id
      }
    });

    // 7. GPS 안심 설정 및 실시간 로그/SOS 발생
    console.log('📡 GPS 안심망 및 이탈/SOS 시딩...');
    // 김순이 할머니 GPS 설정 (보호자 박성민)
    const gps1 = await prisma.gpsSetting.create({
      data: {
        targetPhoneNumber: '010-1234-5678',
        targetAge: 78,
        targetType: 'senior',
        latitude: 37.5665,
        longitude: 126.9780,
        safetyRadius: 100,
        stayTimeLimit: '2시간',
        selectedIllnesses: ['치매', '고혈압'],
        connectionStatus: 'linked',
        consentGranted: true,
        guardianId: patient3.id // 보호자로 연결
      }
    });

    // 이철수 어린이 GPS 설정 (보호자 박성민)
    const gps2 = await prisma.gpsSetting.create({
      data: {
        targetPhoneNumber: '010-9876-5432',
        targetAge: 8,
        targetType: 'child',
        latitude: 37.5672,
        longitude: 126.9810,
        safetyRadius: 200,
        stayTimeLimit: '1시간',
        selectedIllnesses: ['주의산만'],
        connectionStatus: 'linked',
        consentGranted: true,
        guardianId: patient3.id
      }
    });

    // 김순이 할머니 좌표 로그
    await prisma.gpsLog.create({
      data: {
        latitude: 37.5664,
        longitude: 126.9782,
        isSafetyZoneBreached: false,
        gpsSettingId: gps1.id,
        createdAt: new Date(Date.now() - 3600000)
      }
    });

    const breachLog = await prisma.gpsLog.create({
      data: {
        latitude: 37.5685, // 이탈 위치
        longitude: 126.9799,
        isSafetyZoneBreached: true,
        gpsSettingId: gps1.id,
        createdAt: new Date(Date.now() - 1800000)
      }
    });

    // 이철수 어린이 로그
    await prisma.gpsLog.create({
      data: {
        latitude: 37.5673,
        longitude: 126.9812,
        isSafetyZoneBreached: false,
        gpsSettingId: gps2.id
      }
    });

    // SOS 경보 기록
    // 7-1. 과거 해결된 SOS 기록
    await prisma.sosAlert.create({
      data: {
        status: 'resolved',
        latitude: 37.5684,
        longitude: 126.9798,
        verificationSmsSent: true,
        verificationCallMade: true,
        resolvedAt: new Date(Date.now() - 1700000),
        gpsSettingId: gps1.id,
        createdAt: new Date(Date.now() - 1800000)
      }
    });

    // 7-2. 현재 활성 SOS 비상 경보 기록 (이것 때문에 배너가 뜸!)
    await prisma.sosAlert.create({
      data: {
        status: 'triggered',
        latitude: 37.5685,
        longitude: 126.9799,
        verificationSmsSent: true,
        verificationCallMade: false,
        gpsSettingId: gps1.id
      }
    });

    // 8. 알림 기록 (Notifications)
    console.log('🔔 실시간 알림 로그 시딩...');
    await prisma.notification.create({
      data: {
        category: 'sos',
        title: '🚨 비상 경보 호출 발생',
        body: '보호 대상자 김순이(78세, 노인)의 단말기에서 시끄러운 사이렌 긴급 경보가 실행되었습니다.',
        isRead: false,
        userId: patient3.id
      }
    });

    await prisma.notification.create({
      data: {
        category: 'gps',
        title: '⚠️ 안심지역 이탈 감지',
        body: '보호 대상자 김순이님이 설정된 안심 반경 100m 구역을 초과 이탈하였습니다.',
        isRead: false,
        userId: patient3.id
      }
    });

    await prisma.notification.create({
      data: {
        category: 'clinic',
        title: '🩺 비대면 진료 접수 알림',
        body: '김순이 환자분의 [순환기내과 - 행복한내과의원] 비대면 진료 신청서가 성공적으로 접수되었습니다.',
        isRead: true,
        userId: patient1.id
      }
    });

    await prisma.notification.create({
      data: {
        category: 'clinic',
        title: '💳 진료 수납 및 서류 발급',
        body: '박성민님의 행복한내과의원 비대면 진료비 5,200원 수납 및 [소견서] 서류가 정상 자동 발급되었습니다.',
        isRead: true,
        userId: patient3.id
      }
    });

    console.log('\n🎉 디버깅용 더미 데이터 세팅이 완전히 완료되었습니다!');
    console.log('로그인 정보: admin@example.com / admin1234');
    console.log('총 생성된 리소스들:');
    console.log(`- 설정(Configs): ${configs.length}개`);
    console.log(`- 상품(Products): ${products.length}개`);
    console.log(`- 환자/의사(Users): 5명`);
    console.log(`- 통증진단(Reports): 3건`);
    console.log(`- 진료(Sessions): 3건`);
    console.log(`- GPS설정/로그: 2건 / 3건`);
    console.log(`- SOS 긴급 경보: 2건 (활성 1건, 해결 1건)`);
    console.log(`- 알림(Notifications): 4건\n`);

  } catch (error) {
    console.error('더미 데이터 생성 실패:', error);
  } finally {
    await prisma.$disconnect();
  }
}

seedDummyData();
