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
  { v: '基金', ic: 'fund' },
  { v: '債券', ic: 'bond' },
  { v: '加密貨幣', ic: 'crypto' },
  { v: '保險', ic: 'insurance' },
  { v: '不動產', ic: 'property' },
  { v: '車輛', ic: 'car' },
  { v: '其他', ic: 'other' },
];

const DEBT_TYPES = [
  { v: '房貸', ic: 'mortgage' },
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
  { v: 'manual', label: '手動輸入剩餘本金與月付', ic: 'pencil', d: '信用卡、親友借款等' },
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

// 小秤等級（門檻為新台幣淨資產；其他幣別依匯率換算）
const LEVELS = [
  { lv: 6, name: '傳說富豪', min: 3e7, max: Infinity, color: '#ffd54f', msg: '戴上皇冠披上披風，小秤已經是傳說了', desc: '皇冠、披風、彩虹與煙火' },
  { lv: 5, name: '財富自由', min: 1e7, max: 3e7, color: '#ffe066', msg: '墨鏡一戴，誰都不愛，小秤財富自由啦', desc: '墨鏡、錢袋、金幣雨' },
  { lv: 4, name: '富足', min: 5e6, max: 1e7, color: '#ffe08a', msg: '金幣嘩啦啦下，小秤開心到跳起來', desc: '跳舞、揮手、金幣雨' },
  { lv: 3, name: '穩健', min: 2e6, max: 5e6, color: '#9be3c7', msg: '抱著金幣小跳步，日子越過越穩', desc: '抱金幣、小跳步、太陽' },
  { lv: 2, name: '小康', min: 5e5, max: 2e6, color: '#b5e8b8', msg: '曬著太陽搖來搖去，小確幸滿滿', desc: '曬太陽、左右搖擺' },
  { lv: 1, name: '起步新芽', min: 0, max: 5e5, color: '#d6f5d6', msg: '頭上冒出新芽，一步一步長大', desc: '頭頂小芽、輕輕呼吸' },
  { lv: -1, name: '差一點', min: -1e5, max: 0, color: '#ffe3b3', msg: '只差一點就轉正了，小秤有點緊張', desc: '緊張微笑、一滴汗' },
  { lv: -2, name: '小赤字', min: -5e5, max: -1e5, color: '#ffd1a1', msg: '錢長翅膀飛走了，小秤急得冒汗', desc: '冒汗、錢飛走' },
  { lv: -3, name: '苦哈哈', min: -2e6, max: -5e5, color: '#c9d3dc', msg: '頭上一朵小雨雲，小秤苦哈哈', desc: '小雨雲、掉眼淚' },
  { lv: -4, name: '債台高築', min: -5e6, max: -2e6, color: '#aab6c1', msg: '大雨下不停，還貼了OK繃，撐住啊小秤', desc: '大雨、OK繃、淚流不止' },
  { lv: -5, name: '債務深淵', min: -Infinity, max: -5e6, color: '#8f9aa5', msg: '雷雨交加錢包空空，小秤需要一個擁抱', desc: '雷雨、空錢包、蒼蠅飛' },
];
const LEVEL_EMPTY = { lv: 0, name: '還在睡', color: '#e3e9ee', msg: '還沒有資料，小秤在睡覺', desc: '新增資產或負債叫醒牠' };

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
