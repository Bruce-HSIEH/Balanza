'use strict';
// 選單資料：每個選項都有自繪小圖（見 icons.js）

// 臺灣金融機構（銀行代碼 3 碼）。c = 頭像主色，s = 頭像上顯示的字
const BANKS = [
  { code: '004', name: '臺灣銀行', s: '臺', c: '#1f6f3f' },
  { code: '005', name: '臺灣土地銀行', s: '土', c: '#2e7d32' },
  { code: '006', name: '合作金庫商業銀行', s: '合', c: '#0b6e4f' },
  { code: '007', name: '第一商業銀行', s: '一', c: '#0d47a1' },
  { code: '008', name: '華南商業銀行', s: '華', c: '#c62828' },
  { code: '009', name: '彰化商業銀行', s: '彰', c: '#1565c0' },
  { code: '011', name: '上海商業儲蓄銀行', s: '上', c: '#ad1457' },
  { code: '012', name: '台北富邦商業銀行', s: '富', c: '#00838f' },
  { code: '013', name: '國泰世華商業銀行', s: '國', c: '#2e7d32' },
  { code: '016', name: '高雄銀行', s: '高', c: '#0277bd' },
  { code: '017', name: '兆豐國際商業銀行', s: '兆', c: '#b71c1c' },
  { code: '021', name: '花旗(台灣)商業銀行', s: '花', c: '#1565c0' },
  { code: '048', name: '王道商業銀行', s: '王', c: '#37474f' },
  { code: '050', name: '臺灣中小企業銀行', s: '企', c: '#1976d2' },
  { code: '052', name: '渣打國際商業銀行', s: '渣', c: '#0277bd' },
  { code: '053', name: '台中商業銀行', s: '中', c: '#e65100' },
  { code: '054', name: '京城商業銀行', s: '京', c: '#6a1b9a' },
  { code: '081', name: '滙豐(台灣)商業銀行', s: '滙', c: '#c62828' },
  { code: '101', name: '瑞興商業銀行', s: '瑞', c: '#8d6e63' },
  { code: '102', name: '華泰商業銀行', s: '泰', c: '#5d4037' },
  { code: '103', name: '臺灣新光商業銀行', s: '新', c: '#d84315' },
  { code: '108', name: '陽信商業銀行', s: '陽', c: '#f57c00' },
  { code: '118', name: '板信商業銀行', s: '板', c: '#00695c' },
  { code: '147', name: '三信商業銀行', s: '三', c: '#283593' },
  { code: '700', name: '中華郵政', s: '郵', c: '#2e7d32' },
  { code: '803', name: '聯邦商業銀行', s: '聯', c: '#0d47a1' },
  { code: '805', name: '遠東國際商業銀行', s: '遠', c: '#c2185b' },
  { code: '806', name: '元大商業銀行', s: '元', c: '#1565c0' },
  { code: '807', name: '永豐商業銀行', s: '永', c: '#d32f2f' },
  { code: '808', name: '玉山商業銀行', s: '玉', c: '#00796b' },
  { code: '809', name: '凱基商業銀行', s: '凱', c: '#37474f' },
  { code: '810', name: '星展(台灣)商業銀行', s: '星', c: '#c62828' },
  { code: '812', name: '台新國際商業銀行', s: '台', c: '#c62828' },
  { code: '816', name: '安泰商業銀行', s: '安', c: '#00838f' },
  { code: '822', name: '中國信託商業銀行', s: '信', c: '#2e7d32' },
  { code: '823', name: '將來商業銀行', s: '將', c: '#6a1b9a' },
  { code: '824', name: '連線商業銀行', s: '連', c: '#2e7d32' },
  { code: '826', name: '樂天國際商業銀行', s: '樂', c: '#b71c1c' },
  // 非銀行
  { code: '—', name: '融資／租賃公司', s: '融', c: '#795548', ic: 'bank' },
  { code: '—', name: '親友', s: '友', c: '#ef6c00', ic: 'friends' },
  { code: '—', name: '其他', s: '他', c: '#757575', ic: 'other' },
];

const ASSET_CATS = [
  { v: '現金/存款', ic: 'cash' },
  { v: '台股', ic: 'tw', stock: 'tw' },
  { v: '美股', ic: 'us', stock: 'us' },
  { v: '基金', ic: 'fund', stock: 'fund' },
  { v: '債券', ic: 'bond' },
  { v: '加密貨幣', ic: 'crypto' },
  { v: '保險', ic: 'insurance' },
  { v: '不動產', ic: 'property' },
  { v: '車輛', ic: 'car' },
  { v: '其他', ic: 'other' },
];

const DEBT_TYPES = [
  { v: '房貸', ic: 'mortgage' },
  { v: '理財型房貸', ic: 'hourglass' },
  { v: '信貸', ic: 'loan' },
  { v: '車貸', ic: 'car' },
  { v: '學貸', ic: 'student' },
  { v: '信用卡', ic: 'card' },
  { v: '親友借款', ic: 'friends' },
  { v: '其他', ic: 'other' },
];

const REPAY_METHODS = [
  { v: 'annuity', label: '本息平均攤還', ic: 'scale', d: '每月繳一樣多' },
  { v: 'principal', label: '本金平均攤還', ic: 'stairs', d: '每月本金固定，越繳越少' },
  { v: 'interest', label: '只繳利息到期還本', ic: 'hourglass', d: '例如理財型、股票質押' },
];

const CALC_MODES = [
  { v: 'auto', label: '依貸款條件自動計算', ic: 'calc', d: '輸入貸款金額、年限、寬限期' },
  { v: 'revolving', label: '理財型／額度型（只繳利息）', ic: 'hourglass', d: '依動用金額計息，可連結投資計畫自動遞增' },
  { v: 'manual', label: '手動輸入剩餘本金與月付', ic: 'pencil', d: '信用卡、親友借款等' },
];

// 定期扣款（不算資產負債，只顯示在扣款月曆）
const BILL_KINDS = [
  { v: 'card', label: '信用卡帳單', ic: 'card', d: '結帳日、繳款截止日' },
  { v: 'sub', label: '固定扣繳', ic: 'calendar', d: '訂閱、保險費、房租、水電、教育基金…' },
];
const BILL_CATS = [
  { v: '串流影音', ic: 'play', c: '#8e5bc2' }, { v: 'AI／軟體', ic: 'star', c: '#6b5bd6' }, { v: '電信網路', ic: 'mic', c: '#2f80c9' }, { v: '保險', ic: 'insurance', c: '#2e9e6b' },
  { v: '水電瓦斯', ic: 'fire', c: '#e08a2e' }, { v: '房租', ic: 'townhouse', c: '#8a6a4c' }, { v: '健身', ic: 'heart', c: '#e0563f' }, { v: '雲端儲存', ic: 'export', c: '#3aa0b8' },
  { v: '購物會員', ic: 'basket', c: '#d0732a' }, { v: '遊戲', ic: 'trophy', c: '#5a6ad0' }, { v: '新聞閱讀', ic: 'pencil', c: '#55616a' }, { v: '學習', ic: 'sprout', c: '#3f9a5a' }, { v: '交通', ic: 'road', c: '#4a7fb0' },
  { v: '其他', ic: 'other', c: '#7d8790' },
];
// 各類別常見的服務／公司（選了會自動帶入名稱；c：預設幣別、y：預設週期）
// 格式：[名稱, 搜尋用的別名, 選項]
const BILL_SVCS = {
  '串流影音': [
    ['Netflix', '網飛 奈飛'], ['Disney+', '迪士尼 disney plus'], ['YouTube Premium', 'youtube 油管'], ['Spotify', '聲田'], ['Apple Music', '蘋果音樂'], ['Apple TV+', 'apple tv'],
    ['Apple One', '蘋果 一次訂'], ['Amazon Prime Video', '亞馬遜'], ['Max', 'hbo max hbo go'], ['KKBOX', 'kk'], ['KKTV', ''], ['friDay影音', '遠傳 friday'], ['myVideo', '台灣大 my video'],
    ['LINE TV', ''], ['CATCHPLAY+', 'catchplay'], ['Hami Video', '中華電信 hami'], ['愛奇藝', 'iqiyi'], ['中華電信 MOD', 'mod'], ['4gTV', '四季線上'], ['LiTV', '立視'], ['Ofiii 歐飛', 'ofiii'],
    ['GagaOOLala', 'gaga'], ['YouTube Music', ''], ['Twitch', ''], ['Crunchyroll', ''], ['巴哈姆特動畫瘋', '動畫瘋 巴哈'], ['bilibili 大會員', 'b站'], ['ELTA 愛爾達', '愛爾達 elta'], ['DAZN', ''],
    ['MyMusic', ''], ['Tidal', ''], ['Podcast 訂閱', 'podcast'], ['Patreon', ''], ['YouTube 頻道會員', '頻道會員'],
  ],
  'AI／軟體': [
    ['ChatGPT Plus', 'openai gpt', { c: 'USD' }], ['ChatGPT Pro', 'openai gpt', { c: 'USD' }], ['Claude Pro', 'anthropic', { c: 'USD' }], ['Claude Max', 'anthropic', { c: 'USD' }], ['Google AI Pro', 'gemini 雙子星'],
    ['Microsoft 365', 'office word excel'], ['Copilot Pro', 'microsoft'], ['GitHub Copilot', 'github', { c: 'USD' }], ['Cursor', '', { c: 'USD' }], ['Perplexity Pro', '', { c: 'USD' }], ['Midjourney', '', { c: 'USD' }],
    ['Adobe Creative Cloud', 'photoshop illustrator acrobat'], ['Canva Pro', 'canva'], ['Notion', '', { c: 'USD' }], ['Figma', '', { c: 'USD' }], ['Grammarly', '', { c: 'USD' }], ['1Password', '', { c: 'USD' }],
    ['Bitwarden', '', { c: 'USD', y: '12' }], ['NordVPN', 'vpn', { c: 'USD' }], ['ExpressVPN', 'vpn', { c: 'USD' }], ['Surfshark', 'vpn', { c: 'USD' }], ['Zoom', ''], ['Evernote', '印象筆記'], ['Todoist', ''],
    ['Setapp', '', { c: 'USD' }], ['JetBrains', 'intellij', { c: 'USD', y: '12' }], ['Apple Developer Program', '開發者', { c: 'USD', y: '12' }], ['網域續約', 'domain godaddy cloudflare', { y: '12' }], ['主機／VPS', 'aws gcp 伺服器 hosting'],
    ['防毒軟體', '趨勢 pc-cillin norton 諾頓 卡巴斯基', { y: '12' }],
  ],
  '電信網路': [
    ['中華電信', 'cht 手機 門號'], ['台灣大哥大', 'taiwan mobile 台哥大'], ['遠傳電信', 'fet'], ['中華電信光世代', '光纖 寬頻 網路'], ['中華電信 MOD', 'mod 第四台'], ['台灣大寬頻', '凱擘 有線電視 第四台'],
    ['中嘉寬頻', '有線電視 第四台 bbtv'], ['凱擘大寬頻', 'kbro 有線電視 第四台'], ['遠傳大寬頻', '寬頻 網路'], ['Seednet 新世紀資通', 'seednet'], ['市話', '室內電話'], ['無框行動', '虛擬電信'],
    ['Starlink', '星鏈 衛星'], ['國際漫遊／eSIM', '漫遊 esim'],
  ],
  '保險': [
    ['國泰人壽', '國壽'], ['富邦人壽', ''], ['南山人壽', ''], ['新光人壽', ''], ['台灣人壽', '台壽'], ['全球人壽', ''], ['中國人壽', ''], ['三商美邦人壽', '三商'], ['凱基人壽', ''],
    ['遠雄人壽', ''], ['安聯人壽', 'allianz'], ['保誠人壽', ''], ['元大人壽', ''], ['第一金人壽', ''], ['合作金庫人壽', '合庫'], ['友邦人壽', 'aia'], ['法國巴黎人壽', 'cardif'], ['宏泰人壽', ''],
    ['富邦產險', '車險 產險'], ['國泰產險', '車險 產險'], ['新安東京海上產險', '車險 產險'], ['和泰產險', '車險 產險'], ['明台產險', '車險 產險'], ['新光產險', '車險 產險'], ['華南產險', '車險 產險'],
    ['泰安產險', '車險 產險'], ['旺旺友聯產險', '車險 產險'], ['兆豐產險', '車險 產險'], ['第一產險', '車險 產險'], ['台灣產險', '車險 產險'],
    ['汽車保險', '強制險 第三責任 車體', { y: '12' }], ['機車強制險', '強制險', { y: '12' }], ['勞保', '勞工保險'], ['健保', '全民健保 二代健保'], ['國民年金', '國保'],
  ],
  '水電瓦斯': [
    ['台電電費', '台灣電力公司 電費', { y: '1' }], ['台灣自來水', '水費 自來水公司'], ['臺北自來水', '北水處 水費'], ['大台北區瓦斯', '瓦斯費 天然氣'], ['陽明山瓦斯', '瓦斯費 天然氣'], ['欣欣天然氣', '瓦斯費'],
    ['新海瓦斯', '瓦斯費 天然氣'], ['欣湖天然氣', '瓦斯費'], ['欣泰石油氣', '瓦斯費'], ['欣隆天然氣', '瓦斯費 基隆'], ['欣桃天然氣', '瓦斯費 桃園'], ['欣中天然氣', '瓦斯費 台中'], ['欣林天然氣', '瓦斯費 台中'],
    ['欣彰天然氣', '瓦斯費 彰化'], ['欣雄天然氣', '瓦斯費 高雄'], ['欣高石油氣', '瓦斯費 高雄'], ['欣屏天然氣', '瓦斯費 屏東'], ['桶裝瓦斯', '瓦斯行'], ['污水下水道使用費', '下水道'],
  ],
  '房租': [['房租', '租金'], ['管理費', '大樓 社區'], ['車位月租', '停車位 停車'], ['機車位月租', '停車'], ['倉儲月租', '迷你倉 倉庫'], ['房東代收電費', '分電錶'], ['清潔費', '打掃 家事'], ['網路分攤', '室友']],
  '健身': [
    ['World Gym', '世界健身'], ['健身工廠', 'fitness factory'], ['Anytime Fitness', 'anytime'], ['成吉思汗健身俱樂部', '成吉思汗'], ['Curves 可爾姿', 'curves 女性'], ['true yoga 全真瑜伽', 'true fitness 瑜伽'],
    ['國民運動中心', '運動中心'], ['游泳池月票', '游泳'], ['瑜伽教室', 'yoga'], ['拳擊／格鬥館', '拳擊 泰拳 格鬥'], ['攀岩館', '抱石'], ['私人教練', '教練課'], ['Apple Fitness+', 'apple'], ['Strava', '', { c: 'USD' }],
  ],
  '雲端儲存': [['iCloud+', 'icloud apple'], ['Google One', 'google drive'], ['Dropbox', ''], ['OneDrive', 'microsoft'], ['Box', ''], ['pCloud', ''], ['MEGA', ''], ['Backblaze', '備份']],
  '購物會員': [
    ['Costco 好市多', 'costco 會員', { y: '12' }], ['Uber One', 'uber 外送'], ['foodpanda pandapro', '熊貓 外送 pandapro'], ['Amazon Prime', '亞馬遜', { c: 'USD' }], ['蝦皮 VIP', 'shopee 蝦皮'],
    ['momo 會員', 'momo'], ['家樂福會員', 'carrefour'], ['Apple Care+', '保固', { y: '12' }], ['寵物食品定期購', '飼料'], ['咖啡豆訂閱', '咖啡'],
  ],
  '遊戲': [['PlayStation Plus', 'ps plus ps5 sony'], ['Xbox Game Pass', 'xbox'], ['Nintendo Switch Online', '任天堂 ns'], ['Apple Arcade', ''], ['Google Play Pass', ''], ['EA Play', ''], ['Ubisoft+', ''], ['手遊月卡', '月卡'], ['Discord Nitro', 'discord']],
  '新聞閱讀': [
    ['天下雜誌', '天下'], ['商業周刊', '商周'], ['今周刊', ''], ['遠見雜誌', ''], ['聯合新聞網 VIP', '聯合報 udn'], ['經濟日報', ''], ['自由時報', ''], ['中國時報', ''], ['報導者', '捐款'],
    ['讀墨 Readmoo', 'readmoo 電子書'], ['Kobo Plus', 'kobo 樂天'], ['Kindle Unlimited', 'kindle 亞馬遜', { c: 'USD' }], ['Audible', '有聲書', { c: 'USD' }], ['The New York Times', '紐約時報 nyt', { c: 'USD' }],
    ['The Economist', '經濟學人', { c: 'USD' }], ['Wall Street Journal', '華爾街日報 wsj', { c: 'USD' }], ['Bloomberg', '彭博', { c: 'USD' }], ['Medium', '', { c: 'USD' }], ['Substack', '電子報', { c: 'USD' }],
  ],
  '學習': [['小孩教育基金', '教育基金 儲蓄 小孩 子女'], ['學費', '註冊費 學雜費', { y: '6' }], ['Duolingo Super', '多鄰國 duolingo'], ['Hahow 好學校', 'hahow'], ['Coursera Plus', 'coursera'], ['LinkedIn Premium', 'linkedin'], ['Udemy', ''], ['Skillshare', ''], ['補習班', '補習'], ['才藝課', '鋼琴 美術 舞蹈'], ['安親班', ''], ['托嬰／幼兒園', '幼兒園 托育']],
  '交通': [['TPASS 通勤月票', 'tpass 1200 基北北桃 都會通'], ['高鐵定期票', '高鐵'], ['台鐵定期票', '台鐵 火車'], ['停車月租', '停車'], ['YouBike', 'ubike'], ['GoShare／WeMo', '共享機車 gogoro'], ['Gogoro 電池資費', 'gogoro 電池'], ['iRent', '共享汽車'], ['eTag 儲值', 'etag 國道']],
  '其他': [['捐款', '慈善 公益'], ['社團會費', '會費 公會'], ['父母孝親費', '孝親'], ['零用錢', ''], ['寵物保險', ''], ['保全／監視器', '保全'], ['信用卡年費', '年費', { y: '12' }]],
};
const BILL_CYCLES = [
  { v: '1', label: '每月', n: 1 }, { v: '3', label: '每 3 個月', n: 3 }, { v: '6', label: '每半年', n: 6 }, { v: '12', label: '每年', n: 12 }, { v: 'w', label: '每週', n: 0 },
];
const CURRENCIES = [
  { v: 'TWD', label: 'TWD 新台幣', ic: 'twd' },
  { v: 'USD', label: 'USD 美元', ic: 'usd' },
  { v: 'JPY', label: 'JPY 日圓', ic: 'jpy' },
  { v: 'EUR', label: 'EUR 歐元', ic: 'eur' },
];

const BUILDING_TYPES = [
  { v: '住宅大樓', ic: 'tower', d: '11 層以上有電梯' },
  { v: '華廈', ic: 'midrise', d: '10 層以下有電梯' },
  { v: '公寓', ic: 'apartment', d: '5 層以下無電梯' },
  { v: '透天厝', ic: 'townhouse', d: '' },
  { v: '套房', ic: 'studio', d: '' },
  { v: '店面', ic: 'shop', d: '' },
  { v: '全部', ic: 'search', d: '不分型態' },
];

// 小秤等級：正負各 30 級。門檻為新台幣淨資產（其他幣別依匯率換算）
// 前面每一級只差幾萬～幾十萬，越往上間距越大，但每一級都看得到下一級
const POS_STEPS = [0, 1e5, 2e5, 3e5, 5e5, 7e5, 1e6, 1.5e6, 2e6, 3e6, 4e6, 5e6, 7e6, 1e7, 1.3e7, 1.6e7, 2e7, 2.5e7, 3e7, 4e7, 5e7, 6.5e7, 8e7, 1e8, 1.3e8, 1.6e8, 2e8, 3e8, 5e8, 1e9];
const NEG_STEPS = [0, -5e4, -1e5, -2e5, -3e5, -5e5, -7e5, -1e6, -1.3e6, -1.6e6, -2e6, -2.5e6, -3e6, -4e6, -5e6, -6e6, -7e6, -8.5e6, -1e7, -1.2e7, -1.5e7, -1.8e7, -2.2e7, -2.6e7, -3e7, -3.5e7, -4e7, -5e7, -7e7, -1e8];
const POS_NAMES = ['冒出新芽', '長出葉子', '含苞待放', '曬太陽', '小確幸', '小康之家', '存錢新手', '存錢達人', '穩穩前進',
  '金幣雨', '富足人生', '小有成就', '小富翁', '紳士秤', '優雅富翁', '自由見習生', '財富自由', '自由自在', '千萬俱樂部', '大亨',
  '黃金大亨', '準億萬', '億萬富翁', '億萬大亨', '財閥', '金融巨鱷', '富可敵國', '傳說富豪', '神話富豪', '宇宙首富'];
const NEG_NAMES = ['差一點', '小透支', '緊張兮兮', '錢飛走了', '小赤字', '月光族', '毛毛雨', '苦哈哈', '欲哭無淚',
  '下大雨', '貼OK繃', '雨下不停', '打雷了', '雷雨交加', '暴風雨', '錢包空空', '蒼蠅飛', '縫縫補補', '求救中', '舉牌求救',
  '紙箱秤', '寒風刺骨', '暴風雪', '冷到發抖', '背上枷鎖', '腳鐐', '債台高築', '深淵邊緣', '債務深淵', '無底深淵'];
// 每 3 級一個「階段」：決定主要造型；同階段內的 3 級用星星數、顏色深淺區分
const POS_TIERS = [
  { name: '新芽期', msg: '頭上冒出新芽，一步一步長大', desc: '頭頂小芽、輕輕呼吸', colors: ['#e3f7e3', '#d6f5d6', '#c8f0c8'] },
  { name: '小康期', msg: '曬著太陽搖來搖去，小確幸滿滿', desc: '曬太陽、左右搖擺', colors: ['#c9eec9', '#b5e8b8', '#a5e0ab'] },
  { name: '穩健期', msg: '抱著金幣小跳步，日子越過越穩', desc: '抱金幣、小跳步', colors: ['#b4ead5', '#9be3c7', '#86dbbb'] },
  { name: '富足期', msg: '金幣嘩啦啦下，小秤開心到跳起來', desc: '跳舞、揮手、金幣雨', colors: ['#fff0b3', '#ffe89a', '#ffe082'] },
  { name: '小富翁期', msg: '戴上紳士帽打領結，優雅地數錢', desc: '紳士帽、領結、金幣雨', colors: ['#ffe89a', '#ffe07a', '#ffd966'] },
  { name: '自由期', msg: '墨鏡一戴，誰都不愛，小秤財富自由啦', desc: '墨鏡、錢袋、金幣雨', colors: ['#ffe066', '#ffd84d', '#ffd23f'] },
  { name: '大亨期', msg: '金牌掛胸前，千萬俱樂部歡迎你', desc: '墨鏡、金牌、獎盃光芒', colors: ['#ffd23f', '#ffca28', '#ffc107'] },
  { name: '億萬期', msg: '小皇冠加披風，億萬富翁駕到', desc: '皇冠、披風、金幣雨', colors: ['#ffca28', '#ffc107', '#ffb300'] },
  { name: '財閥期', msg: '坐在雲上看彩虹，錢多到數不完', desc: '皇冠、披風、彩虹、祥雲', colors: ['#ffc107', '#ffb300', '#ffa000'] },
  { name: '傳說期', msg: '金光閃閃還有翅膀，小秤已經是傳說了', desc: '大皇冠、翅膀、彩虹、煙火、光環', colors: ['#ffd54f', '#ffca28', '#ffb300'] },
];
const NEG_TIERS = [
  { name: '緊張期', msg: '只差一點就轉正了，小秤有點緊張', desc: '緊張微笑、冒汗', colors: ['#ffe8c2', '#ffe3b3', '#ffdca3'] },
  { name: '漏財期', msg: '錢長翅膀飛走了，小秤急得冒汗', desc: '錢飛走、狂冒汗', colors: ['#ffd9ad', '#ffd1a1', '#ffc994'] },
  { name: '小雨期', msg: '頭上一朵小雨雲，小秤苦哈哈', desc: '小雨雲、掉眼淚', colors: ['#d5dde4', '#c9d3dc', '#bec9d3'] },
  { name: '大雨期', msg: '大雨下不停，還貼了OK繃，撐住啊', desc: '大雨、OK繃、淚流不止', colors: ['#bcc7d1', '#b2bec9', '#aab6c1'] },
  { name: '雷雨期', msg: '雷雨交加，小秤嚇得發抖', desc: '雷雨、閃電、發抖', colors: ['#a9b5c0', '#a1adb9', '#99a6b2'] },
  { name: '空錢包期', msg: '錢包空空還有蒼蠅飛，好想哭', desc: '空錢包、蒼蠅、補丁', colors: ['#a3aeb8', '#9ba6b0', '#939ea8'] },
  { name: '求救期', msg: '舉著求救牌，小秤需要一個擁抱', desc: '求救牌、紙箱、雨', colors: ['#9aa5af', '#929da7', '#8a959f'] },
  { name: '寒冬期', msg: '暴風雪好冷，小秤圍著圍巾發抖', desc: '暴風雪、圍巾、冷到發抖', colors: ['#a7b9c9', '#9db0c1', '#93a7b9'] },
  { name: '枷鎖期', msg: '腳上拖著債務鐵球，走得好辛苦', desc: '鐵球腳鐐、雷雨', colors: ['#8f9aa5', '#87929d', '#7f8a95'] },
  { name: '深淵期', msg: '掉進債務深淵，但只要開始還，就能慢慢爬上來', desc: '深淵漩渦、鐵球、暴風雨', colors: ['#7f8a95', '#76818c', '#6d7883'] },
];
const LEVELS = [];
for (let i = 29; i >= 0; i--) {
  const t = Math.floor(i / 3), sub = i % 3;
  LEVELS.push({ lv: i + 1, name: POS_NAMES[i], min: POS_STEPS[i], max: i === 29 ? Infinity : POS_STEPS[i + 1], tier: t + 1, sub, color: POS_TIERS[t].colors[sub], msg: POS_TIERS[t].msg, desc: POS_TIERS[t].desc, tierName: POS_TIERS[t].name });
}
for (let i = 0; i < 30; i++) {
  const t = Math.floor(i / 3), sub = i % 3;
  LEVELS.push({ lv: -(i + 1), name: NEG_NAMES[i], min: i === 29 ? -Infinity : NEG_STEPS[i + 1], max: NEG_STEPS[i], tier: -(t + 1), sub, color: NEG_TIERS[t].colors[sub], msg: NEG_TIERS[t].msg, desc: NEG_TIERS[t].desc, tierName: NEG_TIERS[t].name });
}
const LEVEL_EMPTY = { lv: 0, tier: 0, sub: 0, name: '還在睡', color: '#e3e9ee', msg: '還沒有資料，小秤在睡覺', desc: '新增資產或負債叫醒牠', tierName: '' };

// 車輛：c = 代表色，f = 產地，t = 車型（決定小車造型）
const CAR_BRANDS = [
  { v: 'Toyota', zh: '豐田', f: '日本', c: '#e53935', t: 'sedan' },
  { v: 'Lexus', zh: '凌志', f: '日本', c: '#455a64', t: 'sedan' },
  { v: 'Honda', zh: '本田', f: '日本', c: '#d32f2f', t: 'hatch' },
  { v: 'Nissan', zh: '日產', f: '日本', c: '#9e9e9e', t: 'sedan' },
  { v: 'Mazda', zh: '馬自達', f: '日本', c: '#b71c1c', t: 'hatch' },
  { v: 'Mitsubishi', zh: '三菱', f: '日本', c: '#c62828', t: 'suv' },
  { v: 'Subaru', zh: '速霸陸', f: '日本', c: '#1565c0', t: 'suv' },
  { v: 'Suzuki', zh: '鈴木', f: '日本', c: '#fbc02d', t: 'hatch' },
  { v: 'BMW', zh: '寶馬', f: '德國', c: '#1e88e5', t: 'sedan' },
  { v: 'Mercedes-Benz', zh: '賓士', f: '德國', c: '#78909c', t: 'sedan' },
  { v: 'Audi', zh: '奧迪', f: '德國', c: '#424242', t: 'sedan' },
  { v: 'Volkswagen', zh: '福斯', f: '德國', c: '#1976d2', t: 'hatch' },
  { v: 'Porsche', zh: '保時捷', f: '德國', c: '#ffb300', t: 'sport' },
  { v: 'Volvo', zh: '富豪', f: '瑞典', c: '#3949ab', t: 'suv' },
  { v: 'Tesla', zh: '特斯拉', f: '美國', c: '#e0e0e0', t: 'ev' },
  { v: 'Ford', zh: '福特', f: '美國', c: '#0d47a1', t: 'suv' },
  { v: 'Hyundai', zh: '現代', f: '韓國', c: '#00897b', t: 'suv' },
  { v: 'Kia', zh: '起亞', f: '韓國', c: '#e53935', t: 'suv' },
  { v: 'Luxgen', zh: '納智捷', f: '台灣', c: '#5e35b1', t: 'suv' },
  { v: 'Škoda', zh: '斯柯達', f: '捷克', c: '#43a047', t: 'hatch' },
  { v: 'Peugeot', zh: '寶獅', f: '法國', c: '#3f51b5', t: 'hatch' },
  { v: 'MG', zh: 'MG', f: '英國', c: '#d32f2f', t: 'ev' },
  { v: 'Land Rover', zh: '荒原路華', f: '英國', c: '#2e7d32', t: 'suv' },
  { v: 'Gogoro', zh: 'Gogoro', f: '台灣', c: '#26c6da', t: 'scooter' },
  { v: 'KYMCO', zh: '光陽', f: '台灣', c: '#ef5350', t: 'scooter' },
  { v: 'SYM', zh: '三陽', f: '台灣', c: '#42a5f5', t: 'scooter' },
  { v: 'Yamaha', zh: '山葉', f: '日本', c: '#283593', t: 'scooter' },
  { v: '其他', zh: '其他', f: '其他', c: '#8d6e63', t: 'sedan' },
];

// 實價登錄縣市代碼
const COUNTIES = [
  { k: 'A', v: '臺北市' }, { k: 'F', v: '新北市' }, { k: 'H', v: '桃園市' }, { k: 'B', v: '臺中市' },
  { k: 'D', v: '臺南市' }, { k: 'E', v: '高雄市' }, { k: 'C', v: '基隆市' }, { k: 'O', v: '新竹市' },
  { k: 'J', v: '新竹縣' }, { k: 'K', v: '苗栗縣' }, { k: 'N', v: '彰化縣' }, { k: 'M', v: '南投縣' },
  { k: 'P', v: '雲林縣' }, { k: 'I', v: '嘉義市' }, { k: 'Q', v: '嘉義縣' }, { k: 'T', v: '屏東縣' },
  { k: 'G', v: '宜蘭縣' }, { k: 'U', v: '花蓮縣' }, { k: 'V', v: '臺東縣' }, { k: 'X', v: '澎湖縣' },
  { k: 'W', v: '金門縣' }, { k: 'Z', v: '連江縣' },
];
