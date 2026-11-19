// 動作庫來源設定：部位分類、截圖動作、日曆動作與 Free Exercise DB 的對應。
// 由 build-library.js 讀取，產生 docs/library.js 與 docs/fedb-steps.json。

// 8 個部位，順序照使用者提供的「選擇運動」截圖。
exports.parts = ['肩頸部', '胸部', '腹部', '上背部', '下背部', '手臂', '臀部', '腿部'];

// Free Exercise DB 主要肌群 → 部位
exports.muscleParts = {
  shoulders: ['肩頸部'], neck: ['肩頸部'], traps: ['肩頸部', '上背部'],
  chest: ['胸部'], abdominals: ['腹部'],
  lats: ['上背部'], 'middle back': ['上背部'], 'lower back': ['下背部'],
  biceps: ['手臂'], triceps: ['手臂'], forearms: ['手臂'],
  glutes: ['臀部'], abductors: ['臀部', '腿部'], adductors: ['腿部'],
  quadriceps: ['腿部'], hamstrings: ['腿部'], calves: ['腿部']
};

exports.muscleNames = {
  abdominals: '腹肌', hamstrings: '腿後肌群', adductors: '內收肌群', quadriceps: '股四頭肌',
  biceps: '肱二頭肌', shoulders: '三角肌', chest: '胸大肌', 'middle back': '中背（菱形肌、斜方肌中段）',
  calves: '小腿', glutes: '臀肌', 'lower back': '下背（豎脊肌）', lats: '闊背肌', triceps: '肱三頭肌',
  traps: '斜方肌', forearms: '前臂', neck: '頸部', abductors: '外展肌群'
};
exports.equipmentNames = {
  'body only': '徒手', machine: '機械', other: '其他', 'foam roll': '滾筒', kettlebells: '壺鈴',
  dumbbell: '啞鈴', cable: '滑輪', barbell: '槓鈴', bands: '彈力帶', 'medicine ball': '藥球',
  'exercise ball': '抗力球', 'e-z curl bar': 'EZ 槓'
};
exports.levelNames = { beginner: '初階', intermediate: '中階', expert: '進階' };
exports.typeNames = {
  strength: '肌力', stretching: '拉伸', plyometrics: '增強式', strongman: '大力士',
  powerlifting: '健力', cardio: '有氧', 'olympic weightlifting': '奧林匹克舉重'
};

// 使用者截圖中看得到的動作（名稱照截圖）與所在部位。同名動作出現在多個部位時合併。
exports.screenshot = {
  肩頸部: ['阿諾德推舉', '背部夾筆', '背撐', '豹爬', '蟲爬後仰', '側平舉', '蟲爬收腹跳', '側臥右側啞鈴肩外旋',
    '側臥左側啞鈴肩外旋', '彈力帶側平舉', '彈力帶對角伸展', '彈力帶對握上舉', '彈力帶複合平舉', '彈力帶複合推舉'],
  胸部: ['波比跳', '半程伏地挺身', '標準伏地挺身', '彈力帶伏地挺身', '彈力帶推胸', '彈力帶下斜俯臥撐',
    '彈力帶下斜鑽石俯臥撐', '彈力帶窄距俯臥撐', '彈力帶鑽石俯臥撐', '彈力繩推胸', '低位繩索大飛鳥夾胸', '彈性帶夾胸',
    '俯衝轟炸機俯臥撐', '伏地挺身'],
  腹部: ['90°卷腹', '90°卷腹摸腳', '波比', '擺臂平板支撐', '背撐', '豹爬', '棒式撐體', '波速球腹部拉伸',
    '波速球右側側支撐', '波速球右側側支撐抬臂', '波速球右側支撐提膝', '波速球左側側支撐', '波速球左側側支撐抬臂',
    '波速球左側支撐提膝'],
  上背部: ['按摩棒腰部放鬆', '背部夾筆', '背部兩側', '背撐', '背後槓鈴聳肩', '側平舉', '超人式支撐', '單側地雷桿划船',
    '彈力帶側平舉', '彈力帶單側高位下拉', '彈力帶輔助引體', '彈力帶頸後伸展', '彈力繩高位划船', '彈力繩聳肩'],
  下背部: ['按摩棒腰部放鬆', '背部夾筆', '背撐', '超人式支撐', '低位蟹式', '伏地挺身', '伏地挺身轉體', '俯臥對角線伸展',
    '俯臥骨盆前傾練習', '俯臥交替衝拳', '俯臥兩頭起', '反向健腹輪訓練', '反向支撐交替摸腳', '負重山羊挺身'],
  腿部: ['波比', '波比跳', '半蹲', '半蹲側抬腿', '半蹲前後移動', '半蹲左右移動', '並腳後撤步', '抱腳尖蹲起',
    '波速球半蹲搖擺', '波速球摸地蹲', '波速球右側箭步蹲', '波速球左側箭步蹲', '側弓箭步', '側滑步']
};

// 截圖動作與既有動作是同一個動作時，併到既有動作（截圖名稱保留為別名，可搜尋）。
// 值可為日曆動作名稱或 Free Exercise DB 的 id。
exports.screenshotSame = {
  '側平舉': '啞鈴側平舉',
  '標準伏地挺身': '伏地挺身',
  '棒式撐體': '平板支撐',
  '低位繩索大飛鳥夾胸': 'Low_Cable_Crossover',
  '彈力帶輔助引體': 'Band_Assisted_Pull-Up'
};

// 日曆動作 → Free Exercise DB id（只放確定是同一動作與器材者；中文名完全相同者會自動合併）。
exports.mineToFedb = {
  '滑輪高位下拉': 'Wide-Grip_Lat_Pulldown',
  '跑步機': 'Running_Treadmill',
  '槓鈴平板臥推': 'Barbell_Bench_Press_-_Medium_Grip',
  '槓鈴上斜臥推': 'Barbell_Incline_Bench_Press_-_Medium_Grip',
  '槓鈴坐姿肩推': 'Seated_Barbell_Military_Press',
  '機械肩推': 'Machine_Shoulder_Military_Press',
  '自重深蹲': 'Bodyweight_Squat',
  '自重引體向上': 'Pullups',
  '自重反手引體向上': 'Chin-Up',
  '窄握滑輪高位下拉': 'Close-Grip_Front_Lat_Pulldown',
  '滑輪反向飛鳥': 'Cable_Rear_Delt_Fly',
  '站姿交替腿後勾': 'Standing_Leg_Curl',
  '爬樓機': 'Stairmaster',
  '自重臀橋': 'Butt_Lift_Bridge',
  '二頭彎舉': 'Dumbbell_Bicep_Curl'
};

// 日曆動作沒有對應資料時的部位（依動作本身判斷）。
exports.minePartsByGroup = {
  '胸': ['胸部'], '背': ['上背部'], '肩／後束': ['肩頸部'], '腿前': ['腿部'], '腿後／臀': ['臀部', '腿部'],
  '核心': ['腹部'], '有氧': ['腿部'], '手臂': ['手臂']
};
exports.mineParts = {
  '滑輪臉拉': ['肩頸部', '上背部'], '蝴蝶機反向飛鳥': ['肩頸部', '上背部'], '滑輪反向飛鳥': ['肩頸部', '上背部'],
  '反向飛鳥（器材未記明）': ['肩頸部', '上背部'], '啞鈴俯身反飛鳥': ['肩頸部', '上背部'], '臉拉接肩推': ['肩頸部'],
  '雙槓撐體': ['胸部', '手臂'], '腿前踢': ['腿部', '臀部'], '腿側踢': ['腿部', '臀部'], '猴式深蹲': ['腿部'],
  '前腿伸直拉腿後': ['腿部'], '仆步拉伸': ['腿部'], '站姿金字塔式': ['腿部'], '甩手': ['肩頸部'],
  '腹式呼吸': ['腹部'], '鳥狗式': ['腹部', '下背部'], '死蟲式': ['腹部'], '超人式': ['下背部'],
  '徒手硬舉啟動': ['臀部', '下背部'], '槓鈴硬舉': ['臀部', '腿部', '下背部'], '硬舉（器材未記明）': ['臀部', '腿部', '下背部'],
  '六角槓硬舉': ['臀部', '腿部', '下背部'], '機械硬舉': ['臀部', '腿部', '下背部'],
  '機械髖外展': ['臀部'], '髖外展（器材未記明）': ['臀部'], '坐姿彈力帶髖外展': ['臀部'],
  '機械髖內收': ['腿部'], '髖內收（器材未記明）': ['腿部'], '跪姿蹬腳鏈': ['臀部'], '站姿蹬腳鏈': ['臀部'],
  '機械臀推': ['臀部'], '機械臀橋': ['臀部'], '自重臀橋': ['臀部'], '啞鈴臀橋': ['臀部'], '臀推（器材未記明）': ['臀部'],
  '滑輪站姿抗旋轉推': ['腹部'], '平板支撐': ['腹部'], '機械補助引體向上': ['上背部', '手臂'],
  '自重引體向上': ['上背部', '手臂'], '自重反手引體向上': ['上背部', '手臂'], '窄握自重引體向上': ['上背部', '手臂'],
  '二頭彎舉': ['手臂'], '深蹲': ['腿部', '臀部'], '伏地挺身': ['胸部', '手臂', '下背部'],
  '拉伸': [], '動態暖身／動態拉伸': [], '滾筒放鬆': [], '瑜伽': [], '戶外健走': ['腿部'], '戶外跑步／跑走': ['腿部'],
  '爬樓梯': ['腿部'], '爬樓機': ['腿部'], '推雪橇': ['腿部', '臀部'], '跑步機': ['腿部']
};

// 可計次的動作（Free Exercise DB id → 計次規則）。規則名稱對應 camera.js。
exports.fedbTrack = {
  '深蹲': ['Bodyweight_Squat', 'Barbell_Squat', 'Barbell_Full_Squat', 'Front_Barbell_Squat', 'Goblet_Squat',
    'Dumbbell_Squat', 'Smith_Machine_Squat', 'Wide_Stance_Barbell_Squat', 'Narrow_Stance_Squats', 'Plie_Dumbbell_Squat',
    'Front_Squat_Clean_Grip', 'Weighted_Squat', 'Hack_Squat', 'Chair_Squat', 'Sit_Squats', 'Box_Squat'],
  '伏地挺身': ['Pushups', 'Push-Up_Wide', 'Push-Ups_-_Close_Triceps_Position', 'Push-Ups_With_Feet_Elevated', 'Decline_Push-Up'],
  '二頭彎舉': ['Dumbbell_Bicep_Curl', 'Barbell_Curl', 'Hammer_Curls', 'EZ-Bar_Curl', 'Dumbbell_Alternate_Bicep_Curl',
    'Standing_Biceps_Cable_Curl', 'Close-Grip_EZ_Bar_Curl', 'Wide-Grip_Standing_Barbell_Curl', 'Close-Grip_Standing_Barbell_Curl'],
  '腿伸展': ['Leg_Extensions', 'Single-Leg_Leg_Extension'],
  '腿彎舉': ['Seated_Leg_Curl', 'Lying_Leg_Curls', 'Standing_Leg_Curl'],
  '胸推': ['Barbell_Bench_Press_-_Medium_Grip', 'Dumbbell_Bench_Press', 'Barbell_Incline_Bench_Press_-_Medium_Grip',
    'Incline_Dumbbell_Press', 'Smith_Machine_Bench_Press', 'Smith_Machine_Incline_Bench_Press', 'Machine_Bench_Press',
    'Leverage_Chest_Press', 'Leverage_Incline_Chest_Press', 'Cable_Chest_Press', 'Wide-Grip_Barbell_Bench_Press',
    'Close-Grip_Barbell_Bench_Press', 'Dumbbell_Bench_Press_with_Neutral_Grip', 'Decline_Barbell_Bench_Press',
    'Decline_Dumbbell_Bench_Press'],
  '坐姿划船': ['Seated_Cable_Rows'],
  '高位下拉': ['Wide-Grip_Lat_Pulldown', 'Close-Grip_Front_Lat_Pulldown', 'V-Bar_Pulldown', 'Underhand_Cable_Pulldowns',
    'Full_Range-Of-Motion_Lat_Pulldown'],
  '腿推': ['Leg_Press', 'Narrow_Stance_Leg_Press', 'Smith_Machine_Leg_Press'],
  '臀推': ['Barbell_Hip_Thrust', 'Barbell_Glute_Bridge', 'Butt_Lift_Bridge', 'Single_Leg_Glute_Bridge'],
  '引體向上': ['Pullups', 'Chin-Up', 'Band_Assisted_Pull-Up', 'Weighted_Pull_Ups', 'V-Bar_Pullup', 'Mixed_Grip_Chin',
    'Wide-Grip_Rear_Pull-Up'],
  '側平舉': ['Side_Lateral_Raise', 'Lateral_Raise_-_With_Bands', 'Seated_Side_Lateral_Raise']
};

// 截圖動作的搜尋別名（台灣常用說法）
exports.extraAliases = {
  '90°卷腹': ['捲腹', '卷腹', 'crunch'], '90°卷腹摸腳': ['捲腹', '卷腹'], '波比': ['burpee'], '波比跳': ['burpee'],
  '豹爬': ['熊爬', 'bear crawl'], '彈力帶下斜俯臥撐': ['伏地挺身'], '彈力帶下斜鑽石俯臥撐': ['伏地挺身'],
  '彈力帶窄距俯臥撐': ['伏地挺身'], '彈力帶鑽石俯臥撐': ['伏地挺身'], '俯衝轟炸機俯臥撐': ['伏地挺身'],
  '波速球腹部拉伸': ['bosu'], '按摩棒腰部放鬆': ['滾筒', '放鬆'], '負重山羊挺身': ['背伸展', '羅馬椅'],
  '反向健腹輪訓練': ['健腹輪'], '側弓箭步': ['側向弓箭步'], '半蹲': ['深蹲'],
  '滑輪臉拉': ['面拉', 'face pull'], '腿推機': ['leg press'], '滑輪高位下拉': ['背闊肌下拉', 'lat pulldown'],
  '滑輪坐姿划船': ['坐姿划船', 'seated row'], '啞鈴側平舉': ['側平舉', 'lateral raise']
};
