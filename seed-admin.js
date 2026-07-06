require('dotenv').config();
const bcrypt = require('bcryptjs');
const prisma = require('./db');

const symptomsSeedData = [
  // 머리
  { part: 'head', partLabel: '머리', isInternal: false, subcategory: 'muscle', symptoms: ['머리 뒤쪽 뻐근함', '뒷목 당김 근육통', '관자놀이 압박 통증'] },
  { part: 'head', partLabel: '머리', isInternal: false, subcategory: 'vein', symptoms: ['박동성 관자놀이 통증', '뇌 혈관 찌릿함', '편두통성 박동'] },
  { part: 'head', partLabel: '머리', isInternal: false, subcategory: 'bone', symptoms: ['두개골 압박감', '충격 후 골절 의심', '턱관절 삐걱거림'] },
  { part: 'head', partLabel: '머리', isInternal: false, subcategory: 'skin', symptoms: ['두피 가려움', '두피 뾰루지/염증', '두피 감각 예민'] },
  { part: 'head', partLabel: '머리', isInternal: false, subcategory: 'tumor', symptoms: ['머리에 만져지는 혹', '두피 아래 지방종', '머리 뒤쪽 딱딱한 종괴'] },
  { part: 'head', partLabel: '머리', isInternal: false, subcategory: 'discharge', symptoms: ['두피 진물/고름', '상처 삼출물', '두피 찰과상'] },
  { part: 'head', partLabel: '머리', isInternal: true, subcategory: 'stabbing', symptoms: ['극심한 두통', '송곳으로 찌르는 통증', '바늘로 콕콕 찌르는 느낌', '눈 뒤쪽 통증'] },
  { part: 'head', partLabel: '머리', isInternal: true, subcategory: 'squeezing', symptoms: ['편두통', '머리를 띠로 조이는 듯한 통증', '편측마비'] },
  { part: 'head', partLabel: '머리', isInternal: true, subcategory: 'burning', symptoms: ['머리 전체 열감', '두피 화끈거림', '경직 및 발열'] },
  { part: 'head', partLabel: '머리', isInternal: true, subcategory: 'heavy', symptoms: ['머리가 묵직함', '어지러움', '머릿속 답답함', '언어장애', '의식 변화'] },
  { part: 'head', partLabel: '머리', isInternal: true, subcategory: 'pulsating', symptoms: ['맥박에 맞춰 지끈거림', '박동성 관자놀이 통증', '관자놀이가 욱신거림'] },
  { part: 'head', partLabel: '머리', isInternal: true, subcategory: 'bloating', symptoms: ['머리 내부 압박감', '뇌압 오르는 느낌', '두개골 내 팽창감'] },

  // 목
  { part: 'neck', partLabel: '목', isInternal: false, subcategory: 'muscle', symptoms: ['목덜미 뻐근함', '어깨 연결 부위 근육 뭉침', '목 움직임 시 뻐근함'] },
  { part: 'neck', partLabel: '목', isInternal: false, subcategory: 'vein', symptoms: ['목 혈관 박동성 통증', '경동맥 부위 지릿함', '목 주변 부종'] },
  { part: 'neck', partLabel: '목', isInternal: false, subcategory: 'bone', symptoms: ['목뼈 삐걱거림', '거북목 증후군 의심', '목 디스크 방사통'] },
  { part: 'neck', partLabel: '목', isInternal: false, subcategory: 'skin', symptoms: ['목 주변 피부 발진', '가려움증', '목 뒤 아토피성 염증'] },
  { part: 'neck', partLabel: '목', isInternal: false, subcategory: 'tumor', symptoms: ['림프절 멍울', '지방종 의심 종괴', '갑상선 부위 혹'] },
  { part: 'neck', partLabel: '목', isInternal: false, subcategory: 'discharge', symptoms: ['목 주변 상처 및 진물', '피부 쓸림 찰과상', '고름 분비'] },
  { part: 'neck', partLabel: '목', isInternal: true, subcategory: 'stabbing', symptoms: ['침 삼킬 때 목 따가움', '목구멍 송곳 통증', '편도선 붓고 찌름'] },
  { part: 'neck', partLabel: '목', isInternal: true, subcategory: 'squeezing', symptoms: ['목이 조이는 듯한 답답함', '식도 이물감', '삼킴 곤란'] },
  { part: 'neck', partLabel: '목', isInternal: true, subcategory: 'burning', symptoms: ['목구멍 화끈거림', '역류성 식도염 증상', '목 안쪽 열감'] },
  { part: 'neck', partLabel: '목', isInternal: true, subcategory: 'heavy', symptoms: ['목 주변이 묵직함', '갑상선 부위 붓고 묵직함', '목소리 쉼'] },
  { part: 'neck', partLabel: '목', isInternal: true, subcategory: 'pulsating', symptoms: ['목 주변 박동감', '경동맥 욱신거림', '목 부근 혈류 압박감'] },
  { part: 'neck', partLabel: '목', isInternal: true, subcategory: 'bloating', symptoms: ['목구멍 부어오름', '기도 협착감', '식도 팽만감'] },

  // 가슴
  { part: 'chest', partLabel: '가슴', isInternal: false, subcategory: 'muscle', symptoms: ['가슴 앞쪽 근육통', '갈비뼈 주변 뻐근함', '움직일 때만 아픈 통증'] },
  { part: 'chest', partLabel: '가슴', isInternal: false, subcategory: 'vein', symptoms: ['가슴 핏줄 비침', '가슴 혈관 압박감', '왼쪽 가슴 저릿함'] },
  { part: 'chest', partLabel: '가슴', isInternal: false, subcategory: 'bone', symptoms: ['흉골 압박 통증', '갈비뼈 골절 의심', '기침 시 갈비뼈 통증'] },
  { part: 'chest', partLabel: '가슴', isInternal: false, subcategory: 'skin', symptoms: ['가슴 피부 발진', '유두 주변 통증/염증', '가슴 땀띠'] },
  { part: 'chest', partLabel: '가슴', isInternal: false, subcategory: 'tumor', symptoms: ['유방/가슴 만져지는 멍울', '가슴 피부 아래 말랑한 혹', '흉부 종양 의심'] },
  { part: 'chest', partLabel: '가슴', isInternal: false, subcategory: 'discharge', symptoms: ['가슴 상처', '유두 주변 분비물', '피부 고름'] },
  { part: 'chest', partLabel: '가슴', isInternal: true, subcategory: 'stabbing', symptoms: ['가슴 찌르는 통증', '숨 쉴 때 콕콕 쑤심', '기침 시 날카로운 통증'] },
  { part: 'chest', partLabel: '가슴', isInternal: true, subcategory: 'squeezing', symptoms: ['호흡 곤란 및 가슴 통증', '심장이 쥐어짜는 듯한 압박', '명치 끝 쥐어짜는 통증'] },
  { part: 'chest', partLabel: '가슴', isInternal: true, subcategory: 'burning', symptoms: ['가슴 쓰림', '식도 타는 듯한 통증', '가슴 속 열감'] },
  { part: 'chest', partLabel: '가슴', isInternal: true, subcategory: 'heavy', symptoms: ['가슴 답답함', '심장 두근거림', '가슴이 막힌 듯한 느낌'] },
  { part: 'chest', partLabel: '가슴', isInternal: true, subcategory: 'pulsating', symptoms: ['심장 박동 요동', '부정맥성 지끈거림', '가슴 속 욱신거림'] },
  { part: 'chest', partLabel: '가슴', isInternal: true, subcategory: 'bloating', symptoms: ['가슴 가스 차고 답답함', '폐 팽창 압박감', '흉부 압박 팽만감'] },

  // 복부
  { part: 'abdomen', partLabel: '복부', isInternal: false, subcategory: 'muscle', symptoms: ['복직근 근육통', '옆구리 당김', '배 힘줄 때 통증'] },
  { part: 'abdomen', partLabel: '복부', isInternal: false, subcategory: 'vein', symptoms: ['복부 혈관 확장 비침', '하복부 저릿함', '장벽 혈행 장애 의심'] },
  { part: 'abdomen', partLabel: '복부', isInternal: false, subcategory: 'bone', symptoms: ['갈비뼈 아래 압박 통증', '골반뼈 연결부 뻐근함', '하복부 뼈 통증'] },
  { part: 'abdomen', partLabel: '복부', isInternal: false, subcategory: 'skin', symptoms: ['배 주변 가려움', '복부 피부 두드러기', '배꼽 주변 진물'] },
  { part: 'abdomen', partLabel: '복부', isInternal: false, subcategory: 'tumor', symptoms: ['복부 아래 말랑한 멍울', '배 주변에 잡히는 덩어리', '옆구리 혹/종괴'] },
  { part: 'abdomen', partLabel: '복부', isInternal: false, subcategory: 'discharge', symptoms: ['복부 찰과상', '배꼽 주변 염증/진물', '상처 삼출물'] },
  { part: 'abdomen', partLabel: '복부', isInternal: true, subcategory: 'stabbing', symptoms: ['콕콕 찌르는 복통', '맹장 칼로 찌르는 통증', '옆구리 송곳 통증'] },
  { part: 'abdomen', partLabel: '복부', isInternal: true, subcategory: 'squeezing', symptoms: ['위가 쥐어짜는 듯한 위경련', '창자가 뒤틀리는 통증', '생리통'] },
  { part: 'abdomen', partLabel: '복부', isInternal: true, subcategory: 'burning', symptoms: ['속쓰림', '위산 역류 열감', '명치 아래 타는 듯한 느낌'] },
  { part: 'abdomen', partLabel: '복부', isInternal: true, subcategory: 'heavy', symptoms: ['소화불량 및 더부룩함', '메스꺼움 및 구토', '설사'] },
  { part: 'abdomen', partLabel: '복부', isInternal: true, subcategory: 'pulsating', symptoms: ['복부 대동맥 욱신거림', '장기 박동성 찌릿함', '하복부 욱신거림'] },
  { part: 'abdomen', partLabel: '복부', isInternal: true, subcategory: 'bloating', symptoms: ['복부 팽만감 및 가스 참', '배가 빵빵하게 터질 듯한 압박', '위장관 팽창'] }
];

async function seedAll() {
  const email = 'admin@example.com';
  const plainPassword = 'admin1234';
  
  try {
    // 1. 관리자 계정 시드
    const existing = await prisma.user.findUnique({ where: { email } });
    if (!existing) {
      const hashedPassword = await bcrypt.hash(plainPassword, 10);
      const newAdmin = await prisma.user.create({
        data: {
          email,
          name: '최고관리자',
          password: hashedPassword,
          role: 'admin',
          phone: '010-0000-0000',
          age: 35,
          gender: '남성'
        }
      });
      console.log(`🎉 관리자 계정 생성 완료: ${email}`);
    } else {
      console.log(`[시드] 관리자 계정(${email})이 이미 존재합니다.`);
      if (existing.role !== 'admin') {
        await prisma.user.update({
          where: { id: existing.id },
          data: { role: 'admin' }
        });
      }
    }

    // 2. 건강체크 증상 메타데이터 시드
    const metaCount = await prisma.symptomMetadata.count();
    if (metaCount === 0) {
      console.log('[시드] 증상 메타데이터 초기 등록 시작...');
      for (const m of symptomsSeedData) {
        await prisma.symptomMetadata.create({ data: m });
      }
      console.log(`🎉 증상 메타데이터 ${symptomsSeedData.length}건 세팅 완료!`);
    } else {
      console.log(`[시드] 증상 메타데이터가 이미 존재합니다. (${metaCount}건)`);
    }

  } catch (error) {
    console.error('시드 생성 중 오류 발생:', error);
  } finally {
    await prisma.$disconnect();
  }
}

seedAll();
