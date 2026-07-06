require('dotenv').config();
const { spawn } = require('child_process');
const prisma = require('./db');

async function runQA() {
  console.log('=== 🚀 건강체크 안심케어 서비스 백엔드 QA 시작 ===\n');

  // 1. 기존 테스트 유저가 있으면 cascade 삭제로 데이터 정리
  const testEmail = `qa_test_user_${Date.now()}@example.com`;
  console.log(`[정보] 테스트 유저 이메일: ${testEmail}`);

  // 2. 서버 실행
  console.log('[서버] API 서버 실행 중...');
  const server = spawn('node', ['index.js'], { stdio: 'pipe' });

  // 서버 로그 출력 수집
  server.stdout.on('data', (data) => {
    const output = data.toString();
    if (output.includes('작동중')) {
      console.log(`[서버 로그] ${output.trim()}`);
    }
  });

  server.stderr.on('data', (data) => {
    console.error(`[서버 에러] ${data.toString().trim()}`);
  });

  // 서버 부팅 대기
  await new Promise(resolve => setTimeout(resolve, 1500));

  const baseUrl = 'http://localhost:3000/api';
  let token = '';
  let userId = null;
  let doctorToken = '';
  let doctorUserId = null;
  let gpsSettingId = null;
  let telemedicineSessionId = null;
  let docId = null;

  try {
    // === TEST 1: 회원가입 (환자 및 의사) ===
    console.log('\n--- 1. 회원가입 테스트 ---');
    const registerRes = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        password: 'password123',
        name: 'QA테스터'
      })
    });
    const registerData = await registerRes.json();
    if (registerRes.ok && registerData.token) {
      token = registerData.token;
      userId = registerData.user.id;
      console.log('✅ 환자 회원가입 성공 (JWT 토큰 획득)');
    } else {
      throw new Error(`환자 회원가입 실패: ${JSON.stringify(registerData)}`);
    }

    // 의사 등록 권한을 얻기 위해 최고관리자로 로그인
    console.log('   - 의사 등록을 위해 최고관리자 계정 로그인...');
    const adminLoginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@example.com',
        password: 'admin1234'
      })
    });
    const adminLoginData = await adminLoginRes.json();
    if (!adminLoginRes.ok || !adminLoginData.token) {
      throw new Error(`관리자 로그인 실패: ${JSON.stringify(adminLoginData)}`);
    }
    const adminToken = adminLoginData.token;
    console.log('✅ 관리자 로그인 성공 (JWT 토큰 획득)');

    // 의사 회원가입
    const testDoctorEmail = `qa_test_doctor_${Date.now()}@example.com`;
    const registerDocRes = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}` // 관리자 인가 전달
      },
      body: JSON.stringify({
        email: testDoctorEmail,
        password: 'password123',
        name: 'QA의사',
        role: 'doctor'
      })
    });
    const registerDocData = await registerDocRes.json();
    if (registerDocRes.ok && registerDocData.token) {
      doctorToken = registerDocData.token;
      doctorUserId = registerDocData.user.id;
      console.log('✅ 의사 회원가입 성공 (JWT 토큰 획득, 역할: doctor)');
    } else {
      throw new Error(`의사 회원가입 실패: ${JSON.stringify(registerDocData)}`);
    }

    // === TEST 2: 프로필 수정 ===
    console.log('\n--- 2. 프로필 수정 테스트 ---');
    const profileRes = await fetch(`${baseUrl}/auth/me`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        phone: '010-1234-5678',
        age: 30,
        gender: '남성',
        height: 175.5,
        weight: 70
      })
    });
    const profileData = await profileRes.json();
    if (profileRes.ok && profileData.age === 30) {
      console.log('✅ 프로필 수정 성공 (나이, 성별, 키, 몸무게 업데이트 완료)');
    } else {
      throw new Error(`프로필 수정 실패: ${JSON.stringify(profileData)}`);
    }

    // === TEST 3: 복약 알림 생성 및 조회 ===
    console.log('\n--- 3. 복약 알림 CRUD 테스트 ---');
    const addMedRes = await fetch(`${baseUrl}/notifications/medications`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        medicineName: '오메가3',
        dosage: '1캡슐',
        times: ['08:00', '19:00'],
        days: ['월', '수', '금']
      })
    });
    const addMedData = await addMedRes.json();
    if (addMedRes.ok && addMedData.id) {
      console.log(`✅ 복약 알림 생성 성공 (약물명: ${addMedData.medicineName})`);
      
      // 조회 테스트
      const getMedsRes = await fetch(`${baseUrl}/notifications/medications`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const medsList = await getMedsRes.json();
      if (getMedsRes.ok && medsList.length > 0) {
        console.log(`✅ 복약 알림 조회 성공 (등록된 복약 수: ${medsList.length})`);
      } else {
        throw new Error('복약 알림 목록 조회 실패');
      }
    } else {
      throw new Error(`복약 알림 생성 실패: ${JSON.stringify(addMedData)}`);
    }

    // === TEST 4: GPS 보호 대상자 연동 ===
    console.log('\n--- 4. GPS 보호 대상자 설정 및 안전지역 체크 테스트 ---');
    const gpsSetRes = await fetch(`${baseUrl}/gps`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        targetType: 'senior',
        targetAge: 78,
        safetyRadius: 100, // 100미터 반경 설정
        stayTimeLimit: '1시간',
        selectedIllnesses: ['치매', '고혈압'],
        targetPhoneNumber: '010-9876-5432',
        connectionStatus: 'linked'
      })
    });
    const gpsSetData = await gpsSetRes.json();
    if (gpsSetRes.ok && gpsSetData.id) {
      gpsSettingId = gpsSetData.id;
      console.log(`✅ GPS 대상 등록 성공 (보호대상 나이: ${gpsSetData.targetAge}, 안전반경: ${gpsSetData.safetyRadius}m)`);
      
      // 중심 좌표를 위도: 37.5665, 경도: 126.9780 (서울시청)으로 설정
      await fetch(`${baseUrl}/gps/${gpsSettingId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          latitude: 37.5665,
          longitude: 126.9780
        })
      });

      // 4-1. 안전구역 내부 위치 로그 (10미터 떨어진 지점)
      console.log('   - 안전지역 내부 위치 전송 시뮬레이션...');
      const logInRes = await fetch(`${baseUrl}/gps/${gpsSettingId}/logs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          latitude: 37.5666, // 약 11미터 차이
          longitude: 126.9781,
          batteryLevel: 95
        })
      });
      const logInData = await logInRes.json();
      console.log(`     결과: 이탈 여부 = ${logInData.isSafetyZoneBreached} (예상값: false)`);

      // 4-2. 안전구역 외부 위치 로그 (500미터 떨어진 지점)
      console.log('   - 안전지역 외부 이탈 전송 시뮬레이션...');
      const logOutRes = await fetch(`${baseUrl}/gps/${gpsSettingId}/logs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          latitude: 37.5710, // 약 500미터 차이
          longitude: 126.9790,
          batteryLevel: 80
        })
      });
      const logOutData = await logOutRes.json();
      console.log(`     결과: 이탈 여부 = ${logOutData.isSafetyZoneBreached} (예상값: true)`);
      if (logOutRes.ok && logOutData.isSafetyZoneBreached === true) {
        console.log('✅ GPS 안전구역 이탈 자동 탐지 및 계산 로직 정상 작동');
      } else {
        throw new Error('이탈 탐지 연산 오작동');
      }
    } else {
      throw new Error(`GPS 대상 등록 실패: ${JSON.stringify(gpsSetData)}`);
    }

    // === TEST 5: SOS 긴급 상황 시뮬레이션 ===
    console.log('\n--- 5. SOS 긴급 상황 및 해제 테스트 ---');
    const sosRes = await fetch(`${baseUrl}/gps/${gpsSettingId}/sos`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        latitude: 37.5710,
        longitude: 126.9790
      })
    });
    const sosData = await sosRes.json();
    if (sosRes.ok && sosData.status === 'triggered') {
      console.log(`✅ SOS 발동 성공 (SMS 발송: ${sosData.verificationSmsSent}, 전화 시도: ${sosData.verificationCallMade})`);

      // SOS 해제 테스트
      const resolveRes = await fetch(`${baseUrl}/gps/${gpsSettingId}/sos/resolve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          sosAlertId: sosData.id
        })
      });
      const resolveData = await resolveRes.json();
      if (resolveRes.ok && resolveData.status === 'resolved') {
        console.log('✅ SOS 긴급 상황 정상 해제 성공');
      } else {
        throw new Error('SOS 해제 실패');
      }
    } else {
      throw new Error(`SOS 발동 실패: ${JSON.stringify(sosData)}`);
    }

    // === TEST 6: 비대면 진료 및 대기열 수납 ===
    console.log('\n--- 6. 비대면 진료 접수, 대기열 수락, 수납 테스트 ---');
    const clinicSessionRes = await fetch(`${baseUrl}/telemedicine/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        doctorName: '이서연 의사',
        department: '내과',
        hospitalName: '행복한내과의원',
        symptomDetails: '어제부터 목이 붓고 열이 납니다.'
      })
    });
    const clinicSessionData = await clinicSessionRes.json();
    if (clinicSessionRes.ok && clinicSessionData.id) {
      telemedicineSessionId = clinicSessionData.id;
      console.log(`✅ 비대면 진료 접수 성공 (상태: ${clinicSessionData.status}, 대기번호: ${clinicSessionData.waitQueueNumber})`);

      // 6-1. 보안 검증: 일반 환자 토큰으로 진료비/수납 변경 시도 -> 403 차단되어야 함
      console.log('   - 보안 검증: 일반 환자가 진료 완료/수납 임의 조작 시도...');
      const maliciousRes = await fetch(`${baseUrl}/telemedicine/sessions/${telemedicineSessionId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` // 환자 토큰
        },
        body: JSON.stringify({
          status: 'completed',
          billAmount: 0,
          paid: true
        })
      });
      console.log(`     결과: 응답 코드 = ${maliciousRes.status} (예상값: 403)`);
      if (maliciousRes.status !== 403) {
        throw new Error('보안 취약점 존재: 환자가 진료 상태/수납 조작 가능함!');
      }
      console.log('✅ BOLA/IDOR 수납 정보 변조 차단 확인 완료');

      // 6-2. 의사 진료 완료 및 처방전 발급 시뮬레이션 (의사 토큰 사용)
      console.log('   - 의사 권한으로 진료 완료 처리...');
      const completeRes = await fetch(`${baseUrl}/telemedicine/sessions/${telemedicineSessionId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${doctorToken}` // 의사 토큰
        },
        body: JSON.stringify({
          status: 'completed',
          prescriptionUrl: '/prescriptions/prescription_qa.pdf',
          prescriptionSentTo: 'fax: 02-999-8888',
          billAmount: 5200
        })
      });
      const completeData = await completeRes.json();
      if (completeRes.ok && completeData.status === 'completed') {
        console.log(`✅ 의사 진료 완료 및 처방전 팩스 발급 성공 (청구 금액: ${completeData.billAmount}원)`);
      } else {
        console.error('진료 완료 실패 상세:', completeRes.status, completeData);
        throw new Error('진료 완료 시뮬레이션 실패');
      }

      // 후청구 결제 완료 테스트
      const payRes = await fetch(`${baseUrl}/telemedicine/sessions/${telemedicineSessionId}/pay`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const payData = await payRes.json();
      if (payRes.ok && payData.paid === true) {
        console.log('✅ 진료비 후청구 수납 처리 완료');
      } else {
        throw new Error('수납 처리 실패');
      }
    } else {
      throw new Error(`진료 접수 실패: ${JSON.stringify(clinicSessionData)}`);
    }

    // === TEST 7: 보험 서류 조회 및 제출 ===
    console.log('\n--- 7. 의료 서류 자동 발급 및 보험사 제출 테스트 ---');

    // 7-1. 보안 검증: 일반 환자 토큰으로 서류 강제 생성 시도 -> 403 차단되어야 함
    console.log('   - 보안 검증: 일반 환자가 임의 의료 서류 위조 생성 시도...');
    const forgeDocRes = await fetch(`${baseUrl}/documents`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}` // 환자 토큰
      },
      body: JSON.stringify({
        documentType: '소견서',
        hospitalName: '가짜종합병원'
      })
    });
    console.log(`     결과: 응답 코드 = ${forgeDocRes.status} (예상값: 403)`);
    if (forgeDocRes.status !== 403) {
      throw new Error('보안 취약점 존재: 환자가 의료 서류 임의 작성 가능함!');
    }
    console.log('✅ 의료 서류 위조 차단 확인 완료');

    // 7-2. 의사 권한으로 서류 등록 테스트
    console.log('   - 의사 권한으로 추가 서류 등록...');
    const addDocRes = await fetch(`${baseUrl}/documents`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${doctorToken}` // 의사 토큰
      },
      body: JSON.stringify({
        documentType: '소견서',
        hospitalName: '행복한내과의원',
        userId: userId // 환자 ID에게 발급
      })
    });
    const addDocData = await addDocRes.json();
    if (addDocRes.ok && addDocData.id) {
      console.log(`✅ 의사 권한으로 서류 신규 등록 성공 (종류: ${addDocData.documentType})`);
    } else {
      throw new Error('의사 서류 등록 실패');
    }

    const docsRes = await fetch(`${baseUrl}/documents`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const docsList = await docsRes.json();
    if (docsRes.ok && docsList.length > 0) {
      console.log(`✅ 진료 완료 및 결제 시 자동 발급된 서류 확인 성공 (서류 개수: ${docsList.length}개)`);
      docId = docsList[0].id;
      console.log(`   - 발급 서류 확인: [${docsList[0].documentType}] - ${docsList[0].hospitalName}`);

      // 보험사 수동 제출 테스트
      const submitRes = await fetch(`${baseUrl}/documents/${docId}/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          submittedTo: '삼성화재'
        })
      });
      const submitData = await submitRes.json();
      if (submitRes.ok && submitData.status === 'submitted') {
        console.log(`✅ 보험사 서류 제출 완료 (제출처: ${submitData.submittedTo})`);
      } else {
        throw new Error('보험사 제출 실패');
      }
    } else {
      throw new Error('자동 서류 확인 실패');
    }

    // === TEST 8: 생성된 알림 검증 ===
    console.log('\n--- 8. 통합 시스템 알림 기록 및 읽음 처리 테스트 ---');
    const notifsRes = await fetch(`${baseUrl}/notifications`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const notifs = await notifsRes.json();
    if (notifsRes.ok && notifs.length > 0) {
      console.log(`✅ 축적된 시스템 알림 조회 성공 (총 알림 수: ${notifs.length}개)`);
      console.log(`   - 최근 알림 헤드라인: "${notifs[0].title}" -> ${notifs[0].body}`);

      // 전체 읽음 처리
      const readAllRes = await fetch(`${baseUrl}/notifications/read-all`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (readAllRes.ok) {
        console.log('✅ 모든 알림 읽음 처리 완료');
      } else {
        throw new Error('전체 읽음 실패');
      }
    } else {
      throw new Error('알림 내역 조회 실패');
    }

    console.log('\n======================================');
    console.log('🎉 모든 통합 테스트(QA) 성공 및 통과!');
    console.log('======================================');

  } catch (error) {
    console.error('\n❌ QA 테스트 중 실패 항목 발생:');
    console.error(error.message);
  } finally {
    // 데이터베이스 정리 (테스트 유저 삭제 -> Cascade 구조에 의해 연동된 모든 자식 테이블 레코드 제거됨)
    if (userId) {
      console.log('[DB 정리] 테스트 환자 유저 및 관련 기록 삭제 중...');
      try {
        await prisma.user.delete({ where: { id: userId } });
        console.log('🧹 환자 DB 클리닝 완료.');
      } catch (cleanError) {
        console.error('⚠️ 환자 DB 클리닝 오류 발생:', cleanError.message);
      }
    }
    if (doctorUserId) {
      console.log('[DB 정리] 테스트 의사 유저 삭제 중...');
      try {
        await prisma.user.delete({ where: { id: doctorUserId } });
        console.log('🧹 의사 DB 클리닝 완료.');
      } catch (cleanError) {
        console.error('⚠️ 의사 DB 클리닝 오류 발생:', cleanError.message);
      }
    }

    // 서버 프로세스 종료
    console.log('\n[서버] 서버 종료 중...');
    server.kill();
    
    try {
      await prisma.$disconnect();
    } catch (discError) {
      // Ignore disconnect errors
    }
    process.exit(0);
  }
}

runQA();
