/* Shared by the app page and by the price checker. Pure functions, no DOM. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FareCore = api;
})(typeof self !== 'undefined' ? self : globalThis, function () {
'use strict';

/* ===================== small helpers ===================== */
const pad = n => String(n).padStart(2, '0');
const won = n => Math.round(Number(n)).toLocaleString('ko-KR');
const isDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const toD = s => { const a = s.split('-').map(Number); return new Date(a[0], a[1] - 1, a[2]); };
const fromD = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => fromD(new Date());
const todayIn = tz => new Intl.DateTimeFormat('en-CA', {timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date());
const addDays = (s, n) => { const d = toD(s); d.setDate(d.getDate() + n); return fromD(d); };
const diffDays = (a, b) => Math.round((toD(b) - toD(a)) / 86400000);
const DOW = '일월화수목금토';
const md = s => {
  if (!isDate(s)) return '';
  const d = toD(s);
  const y = d.getFullYear() !== new Date().getFullYear() ? `${String(d.getFullYear()).slice(2)}년 ` : '';
  return `${y}${d.getMonth() + 1}/${d.getDate()}(${DOW[d.getDay()]})`;
};
const span = (a, b) => `${md(a)}${b && b !== a ? ' – ' + md(b) : ''}`;
const stamp = iso => { const d = new Date(iso); if (!iso || isNaN(d)) return ''; return `${d.getMonth() + 1}월 ${d.getDate()}일 ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const httpUrl = u => (typeof u === 'string' && /^https?:\/\//i.test(u)) ? u : '';
const posNum = v => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; };
const str = (v, n) => String(v == null ? '' : v).slice(0, n);
const code3 = v => String(v == null ? '' : v).toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
const batchim = s => { const c = String(s).trim().slice(-1).charCodeAt(0); return c >= 0xAC00 && c <= 0xD7A3 && (c - 0xAC00) % 28 !== 0; };
const iga = s => s + (batchim(s) ? '이' : '가');
const ieyo = s => s + (batchim(s) ? '이에요' : '예요');

/* ===================== places ===================== */
/* AIRPORTS:BEGIN (built from tools/curated.py: code, Korean name, note, English name, country, extra search words) */
const AP = [
["SEL","서울","인천·김포 모두","Seoul","KR","인천 김포 seoul"],
["ICN","인천","인천공항만","Incheon","KR","서울 incheon"],
["GMP","김포","김포공항만","Gimpo","KR","서울 gimpo"],
["PUS","부산","김해공항","Busan","KR","김해 busan gimhae"],
["CJU","제주","","Jeju","KR","jeju"],
["TAE","대구","","Daegu","KR","daegu"],
["CJJ","청주","","Cheongju","KR","cheongju 충북"],
["MWX","무안","","Muan","KR","목포 전남 muan"],
["KWJ","광주","","Gwangju","KR","gwangju"],
["YNY","양양","","Yangyang","KR","강릉 속초 강원 yangyang"],
["USN","울산","","Ulsan","KR","ulsan"],
["RSU","여수","","Yeosu","KR","순천 yeosu"],
["KPO","포항경주","","Pohang","KR","포항 경주 pohang"],
["HIN","사천","진주","Sacheon","KR","진주 sacheon"],
["KUV","군산","","Gunsan","KR","전북 gunsan"],
["WJU","원주","","Wonju","KR","횡성 wonju"],
["FUK","후쿠오카","","Fukuoka","JP","하카타 규슈 큐슈 福岡 hakata"],
["OKA","오키나와","나하공항","Okinawa","JP","나하 naha 沖縄 那覇"],
["KIX","오사카 간사이","","Osaka Kansai","JP","大阪 kansai"],
["ITM","오사카 이타미","","Osaka Itami","JP","大阪 伊丹 itami"],
["OSA","오사카","간사이·이타미·고베 모두","Osaka","JP","大阪"],
["NRT","도쿄 나리타","","Tokyo Narita","JP","東京 narita"],
["HND","도쿄 하네다","","Tokyo Haneda","JP","東京 haneda"],
["TYO","도쿄","나리타·하네다 모두","Tokyo","JP","東京"],
["NGO","나고야","주부공항","Nagoya","JP","名古屋 chubu 중부 센트레아"],
["NKM","나고야 고마키","현영 나고야공항","Nagoya Komaki","JP","名古屋 小牧 komaki"],
["CTS","삿포로","신치토세공항","Sapporo","JP","홋카이도 치토세 札幌 hokkaido"],
["OKD","삿포로 오카다마","","Sapporo Okadama","JP","홋카이도 丘珠"],
["KKJ","기타큐슈","","Kitakyushu","JP","北九州 고쿠라"],
["KOJ","가고시마","","Kagoshima","JP","鹿児島"],
["KMJ","구마모토","","Kumamoto","JP","熊本 아소"],
["NGS","나가사키","","Nagasaki","JP","長崎"],
["OIT","오이타","","Oita","JP","벳푸 유후인 大分"],
["HSG","사가","","Saga","JP","佐賀"],
["KMI","미야자키","","Miyazaki","JP","宮崎"],
["AXJ","아마쿠사","","Amakusa","JP","天草 구마모토"],
["TSJ","쓰시마","대마도","Tsushima","JP","대마도 対馬"],
["IKI","이키","","Iki","JP","壱岐 나가사키"],
["FUJ","고토","후쿠에공항","Goto Fukue","JP","후쿠에 五島 福江"],
["TNE","다네가시마","","Tanegashima","JP","種子島"],
["KUM","야쿠시마","","Yakushima","JP","屋久島"],
["ASJ","아마미","아마미오시마","Amami","JP","아마미오시마 奄美"],
["KKX","기카이","","Kikai","JP","喜界"],
["TKN","도쿠노시마","","Tokunoshima","JP","徳之島"],
["OKE","오키노에라부","","Okinoerabu","JP","沖永良部"],
["RNJ","요론","","Yoron","JP","与論"],
["ISG","이시가키","","Ishigaki","JP","石垣 야에야마"],
["MMY","미야코지마","","Miyako","JP","宮古 미야코"],
["SHI","시모지시마","미야코","Shimojishima","JP","미야코 下地島"],
["UEO","구메지마","","Kumejima","JP","久米島"],
["OGN","요나구니","","Yonaguni","JP","与那国"],
["TRA","다라마","","Tarama","JP","多良間"],
["MMD","미나미다이토","","Minamidaito","JP","南大東"],
["KTD","기타다이토","","Kitadaito","JP","北大東"],
["AGJ","아구니","","Aguni","JP","粟国"],
["MYJ","마쓰야마","","Matsuyama","JP","松山 에히메"],
["TAK","다카마쓰","","Takamatsu","JP","高松 가가와"],
["KCZ","고치","","Kochi","JP","高知"],
["TKS","도쿠시마","","Tokushima","JP","徳島"],
["HIJ","히로시마","","Hiroshima","JP","広島"],
["OKJ","오카야마","","Okayama","JP","岡山"],
["YGJ","요나고","","Yonago","JP","돗토리 米子"],
["TTJ","돗토리","","Tottori","JP","鳥取"],
["IZO","이즈모","","Izumo","JP","시마네 마쓰에 出雲"],
["IWJ","이와미","하기·이와미공항","Iwami","JP","마스다 하기 石見"],
["OKI","오키","","Oki","JP","隠岐 시마네"],
["UBJ","우베","야마구치","Ube","JP","야마구치 宇部"],
["IWK","이와쿠니","","Iwakuni","JP","岩国 야마구치"],
["UKB","고베","","Kobe","JP","神戸"],
["TJH","다지마","","Tajima","JP","도요오카 기노사키 但馬"],
["SHM","난키시라하마","","Nanki Shirahama","JP","시라하마 와카야마 白浜"],
["FSZ","시즈오카","","Shizuoka","JP","静岡 후지산"],
["MMJ","마쓰모토","","Matsumoto","JP","나가노 松本"],
["KMQ","고마쓰","가나자와","Komatsu","JP","가나자와 小松"],
["TOY","도야마","","Toyama","JP","富山"],
["NTQ","노토","","Noto","JP","와지마 能登"],
["KIJ","니가타","","Niigata","JP","新潟"],
["SDS","사도","","Sado","JP","佐渡"],
["IBR","이바라키","","Ibaraki","JP","茨城"],
["OIM","이즈오시마","","Izu Oshima","JP","오시마 大島"],
["MYE","미야케지마","","Miyakejima","JP","三宅島"],
["HAC","하치조지마","","Hachijojima","JP","八丈島"],
["SDJ","센다이","","Sendai","JP","仙台 미야기"],
["FKS","후쿠시마","","Fukushima","JP","福島"],
["GAJ","야마가타","","Yamagata","JP","山形"],
["SYO","쇼나이","","Shonai","JP","사카타 쓰루오카 庄内"],
["AXT","아키타","","Akita","JP","秋田"],
["ONJ","오다테노시로","","Odate Noshiro","JP","大館能代 아키타"],
["HNA","하나마키","이와테","Hanamaki","JP","이와테 모리오카 花巻"],
["AOJ","아오모리","","Aomori","JP","青森"],
["MSJ","미사와","","Misawa","JP","三沢 아오모리"],
["HKD","하코다테","","Hakodate","JP","函館"],
["AKJ","아사히카와","","Asahikawa","JP","旭川"],
["OBO","오비히로","","Obihiro","JP","도카치 帯広"],
["KUH","구시로","","Kushiro","JP","釧路"],
["MMB","메만베쓰","","Memanbetsu","JP","아바시리 女満別"],
["SHB","나카시베쓰","","Nakashibetsu","JP","中標津"],
["MBE","몬베쓰","","Monbetsu","JP","紋別"],
["WKJ","왓카나이","","Wakkanai","JP","稚内"],
["RIS","리시리","","Rishiri","JP","利尻"],
["OIR","오쿠시리","","Okushiri","JP","奥尻"],
["TPE","타이베이","타오위안공항","Taipei","TW","대만 taiwan 타이페이"],
["TSA","타이베이 쑹산","","Taipei Songshan","TW","대만 송산"],
["KHH","가오슝","","Kaohsiung","TW","대만"],
["RMQ","타이중","","Taichung","TW","대만"],
["TNN","타이난","","Tainan","TW","대만"],
["HUN","화롄","","Hualien","TW","대만 화련"],
["HKG","홍콩","","Hong Kong","HK",""],
["MFM","마카오","","Macau","MO",""],
["PVG","상하이","푸둥공항","Shanghai","CN","상해 푸동"],
["SHA","상하이 훙차오","","Shanghai Hongqiao","CN","상해 홍차오 홍교"],
["PEK","베이징","서우두공항","Beijing","CN","북경"],
["PKX","베이징 다싱","","Beijing Daxing","CN","북경 대흥"],
["TAO","칭다오","","Qingdao","CN","청도"],
["DLC","다롄","","Dalian","CN","대련"],
["YNJ","옌지","","Yanji","CN","연길 백두산"],
["SHE","선양","","Shenyang","CN","심양"],
["HRB","하얼빈","","Harbin","CN","합이빈"],
["CGQ","창춘","","Changchun","CN","장춘"],
["MDG","무단장","","Mudanjiang","CN","목단강"],
["TSN","톈진","","Tianjin","CN","천진"],
["WEH","웨이하이","","Weihai","CN","위해"],
["YNT","옌타이","","Yantai","CN","연태"],
["TNA","지난","","Jinan","CN","제남"],
["CAN","광저우","","Guangzhou","CN","광주"],
["SZX","선전","","Shenzhen","CN","심천"],
["CTU","청두","솽류공항","Chengdu","CN","성도"],
["TFU","청두 톈푸","","Chengdu Tianfu","CN","성도 천부"],
["CKG","충칭","","Chongqing","CN","중경"],
["XIY","시안","","Xi'an","CN","서안 xian"],
["HGH","항저우","","Hangzhou","CN","항주"],
["NKG","난징","","Nanjing","CN","남경"],
["NGB","닝보","","Ningbo","CN","영파"],
["WUX","우시","","Wuxi","CN","무석"],
["YNZ","옌청","","Yancheng","CN","염성"],
["XMN","샤먼","","Xiamen","CN","하문"],
["FOC","푸저우","","Fuzhou","CN","복주"],
["KMG","쿤밍","","Kunming","CN","곤명"],
["LJG","리장","","Lijiang","CN","여강"],
["SYX","싼야","하이난","Sanya","CN","하이난 삼아"],
["HAK","하이커우","하이난","Haikou","CN","하이난 해구"],
["WUH","우한","","Wuhan","CN","무한"],
["CSX","창사","","Changsha","CN","장사"],
["DYG","장자제","","Zhangjiajie","CN","장가계"],
["KWL","구이린","","Guilin","CN","계림"],
["NNG","난닝","","Nanning","CN","남녕"],
["CGO","정저우","","Zhengzhou","CN","정주"],
["TXN","황산","","Huangshan","CN","黄山"],
["URC","우루무치","","Urumqi","CN",""],
["LXA","라싸","","Lhasa","CN","티베트"],
["UBN","울란바토르","","Ulaanbaatar","MN","몽골"],
["VVO","블라디보스토크","","Vladivostok","RU",""],
["KHV","하바롭스크","","Khabarovsk","RU",""],
["UUS","유즈노사할린스크","사할린","Yuzhno-Sakhalinsk","RU","사할린"],
["IKT","이르쿠츠크","바이칼","Irkutsk","RU","바이칼"],
["SVO","모스크바","셰레메티예보공항","Moscow","RU",""],
["TAS","타슈켄트","","Tashkent","UZ","우즈베키스탄"],
["ALA","알마티","","Almaty","KZ","카자흐스탄"],
["NQZ","아스타나","","Astana","KZ","카자흐스탄"],
["BSZ","비슈케크","","Bishkek","KG","키르기스스탄"],
["DAD","다낭","","Da Nang","VN","호이안"],
["HAN","하노이","","Hanoi","VN",""],
["SGN","호찌민","","Ho Chi Minh City","VN","호치민 사이공"],
["CXR","나트랑","깜라인공항","Nha Trang","VN","냐짱 캄란"],
["PQC","푸꾸옥","","Phu Quoc","VN","푸쿠옥"],
["DLI","달랏","","Da Lat","VN","달랏"],
["HPH","하이퐁","","Hai Phong","VN","하롱베이"],
["VDO","번돈","하롱베이","Van Don","VN","하롱베이 꽝닌"],
["HUI","후에","","Hue","VN",""],
["UIH","꾸이년","","Quy Nhon","VN","퀴논"],
["VCA","껀터","","Can Tho","VN",""],
["BKK","방콕","수완나품공항","Bangkok","TH",""],
["DMK","방콕 돈므앙","","Bangkok Don Mueang","TH","돈무앙"],
["CNX","치앙마이","","Chiang Mai","TH",""],
["CEI","치앙라이","","Chiang Rai","TH",""],
["HKT","푸껫","","Phuket","TH","푸켓"],
["KBV","끄라비","","Krabi","TH","크라비"],
["USM","코사무이","","Koh Samui","TH","사무이"],
["UTP","파타야","우타파오공항","Pattaya","TH","우타파오"],
["HDY","핫야이","","Hat Yai","TH",""],
["MNL","마닐라","","Manila","PH",""],
["CEB","세부","","Cebu","PH",""],
["KLO","보라카이","칼리보공항","Kalibo","PH","칼리보"],
["MPH","보라카이 카티클란","","Caticlan","PH","까띠끌란"],
["TAG","보홀","","Bohol","PH","팡라오"],
["CRK","클락","","Clark","PH",""],
["PPS","푸에르토프린세사","팔라완","Puerto Princesa","PH","팔라완"],
["DVO","다바오","","Davao","PH",""],
["ILO","일로일로","","Iloilo","PH",""],
["SIN","싱가포르","","Singapore","SG",""],
["KUL","쿠알라룸푸르","","Kuala Lumpur","MY",""],
["BKI","코타키나발루","","Kota Kinabalu","MY",""],
["PEN","페낭","","Penang","MY",""],
["LGK","랑카위","","Langkawi","MY",""],
["JHB","조호르바루","","Johor Bahru","MY","조호바루"],
["KCH","쿠칭","","Kuching","MY",""],
["DPS","발리","","Bali","ID","덴파사르"],
["CGK","자카르타","","Jakarta","ID",""],
["SUB","수라바야","","Surabaya","ID",""],
["LOP","롬복","","Lombok","ID",""],
["BTH","바탐","","Batam","ID",""],
["MDC","마나도","","Manado","ID",""],
["BWN","반다르스리브가완","브루나이","Bandar Seri Begawan","BN","브루나이"],
["KTI","프놈펜","","Phnom Penh","KH",""],
["SAI","시엠레아프","앙코르와트","Siem Reap","KH","씨엠립 앙코르와트"],
["VTE","비엔티안","","Vientiane","LA","라오스"],
["LPQ","루앙프라방","","Luang Prabang","LA","라오스"],
["RGN","양곤","","Yangon","MM","미얀마"],
["DEL","델리","","Delhi","IN","뉴델리 인도"],
["BOM","뭄바이","","Mumbai","IN","인도"],
["BLR","벵갈루루","","Bengaluru","IN","방갈로르 인도"],
["MAA","첸나이","","Chennai","IN","인도"],
["CCU","콜카타","","Kolkata","IN","인도"],
["KTM","카트만두","","Kathmandu","NP","네팔"],
["CMB","콜롬보","","Colombo","LK","스리랑카"],
["MLE","말레","몰디브","Male","MV","몰디브"],
["DAC","다카","","Dhaka","BD","방글라데시"],
["GUM","괌","","Guam","GU",""],
["SPN","사이판","","Saipan","MP",""],
["ROR","팔라우","코로르","Palau","PW","코로르"],
["HNL","호놀룰루","","Honolulu","US","하와이 오아후"],
["OGG","마우이","카훌루이공항","Maui","US","하와이 카훌루이"],
["KOA","코나","하와이 빅아일랜드","Kona","US","하와이 빅아일랜드"],
["LIH","카우아이","리후에공항","Kauai","US","하와이 리후에"],
["SYD","시드니","","Sydney","AU",""],
["MEL","멜버른","","Melbourne","AU","멜번"],
["BNE","브리즈번","","Brisbane","AU","브리즈번"],
["OOL","골드코스트","","Gold Coast","AU",""],
["CNS","케언스","","Cairns","AU",""],
["PER","퍼스","","Perth","AU",""],
["AKL","오클랜드","","Auckland","NZ","뉴질랜드"],
["CHC","크라이스트처치","","Christchurch","NZ","뉴질랜드"],
["ZQN","퀸스타운","","Queenstown","NZ","뉴질랜드"],
["NAN","난디","피지","Nadi","FJ","피지"],
["PPT","타히티","파페에테","Tahiti","PF","파페에테"],
["LAX","로스앤젤레스","","Los Angeles","US","LA 엘에이"],
["SFO","샌프란시스코","","San Francisco","US",""],
["SJC","새너제이","","San Jose","US","산호세 실리콘밸리"],
["SEA","시애틀","","Seattle","US",""],
["LAS","라스베이거스","","Las Vegas","US","라스베가스"],
["SAN","샌디에이고","","San Diego","US",""],
["PDX","포틀랜드","","Portland","US",""],
["PHX","피닉스","","Phoenix","US",""],
["SLC","솔트레이크시티","","Salt Lake City","US",""],
["DEN","덴버","","Denver","US",""],
["JFK","뉴욕","JFK공항","New York","US",""],
["EWR","뉴욕 뉴어크","","Newark","US","뉴저지"],
["LGA","뉴욕 라과디아","","New York LaGuardia","US",""],
["BOS","보스턴","","Boston","US",""],
["IAD","워싱턴","덜레스공항","Washington","US","워싱턴 DC"],
["PHL","필라델피아","","Philadelphia","US",""],
["ORD","시카고","오헤어공항","Chicago","US",""],
["DTW","디트로이트","","Detroit","US",""],
["MSP","미니애폴리스","","Minneapolis","US",""],
["ATL","애틀랜타","","Atlanta","US",""],
["DFW","댈러스","","Dallas","US","달라스"],
["IAH","휴스턴","","Houston","US",""],
["MIA","마이애미","","Miami","US",""],
["MCO","올랜도","","Orlando","US",""],
["ANC","앵커리지","","Anchorage","US","알래스카"],
["YVR","밴쿠버","","Vancouver","CA",""],
["YYC","캘거리","","Calgary","CA","밴프"],
["YYZ","토론토","","Toronto","CA",""],
["YUL","몬트리올","","Montreal","CA",""],
["MEX","멕시코시티","","Mexico City","MX",""],
["CUN","칸쿤","","Cancun","MX",""],
["HAV","아바나","","Havana","CU","쿠바"],
["GRU","상파울루","","Sao Paulo","BR","브라질"],
["GIG","리우데자네이루","","Rio de Janeiro","BR","브라질"],
["EZE","부에노스아이레스","","Buenos Aires","AR","아르헨티나"],
["SCL","산티아고","","Santiago","CL","칠레"],
["LIM","리마","","Lima","PE","페루"],
["CUZ","쿠스코","","Cusco","PE","페루 마추픽추"],
["BOG","보고타","","Bogota","CO","콜롬비아"],
["LHR","런던","히스로공항","London","GB","히드로"],
["LGW","런던 개트윅","","London Gatwick","GB",""],
["MAN","맨체스터","","Manchester","GB",""],
["EDI","에든버러","","Edinburgh","GB","에딘버러 스코틀랜드"],
["DUB","더블린","","Dublin","IE","아일랜드"],
["CDG","파리","샤를드골공항","Paris","FR",""],
["ORY","파리 오를리","","Paris Orly","FR",""],
["NCE","니스","","Nice","FR",""],
["AMS","암스테르담","","Amsterdam","NL","네덜란드"],
["BRU","브뤼셀","","Brussels","BE","벨기에"],
["FRA","프랑크푸르트","","Frankfurt","DE",""],
["MUC","뮌헨","","Munich","DE",""],
["BER","베를린","","Berlin","DE",""],
["ZRH","취리히","","Zurich","CH","스위스"],
["GVA","제네바","","Geneva","CH","스위스"],
["VIE","빈","","Vienna","AT","비엔나 오스트리아"],
["PRG","프라하","","Prague","CZ","체코"],
["BUD","부다페스트","","Budapest","HU","헝가리"],
["WAW","바르샤바","","Warsaw","PL","폴란드"],
["FCO","로마","","Rome","IT",""],
["MXP","밀라노","","Milan","IT",""],
["VCE","베네치아","","Venice","IT","베니스"],
["FLR","피렌체","","Florence","IT","플로렌스"],
["NAP","나폴리","","Naples","IT",""],
["BCN","바르셀로나","","Barcelona","ES",""],
["MAD","마드리드","","Madrid","ES",""],
["AGP","말라가","","Malaga","ES",""],
["SVQ","세비야","","Seville","ES",""],
["LIS","리스본","","Lisbon","PT","포르투갈"],
["OPO","포르투","","Porto","PT","포르투갈"],
["ATH","아테네","","Athens","GR","그리스"],
["JTR","산토리니","","Santorini","GR","그리스"],
["CPH","코펜하겐","","Copenhagen","DK","덴마크"],
["ARN","스톡홀름","","Stockholm","SE","스웨덴"],
["OSL","오슬로","","Oslo","NO","노르웨이"],
["HEL","헬싱키","","Helsinki","FI","핀란드"],
["KEF","레이캬비크","아이슬란드","Reykjavik","IS","아이슬란드"],
["ZAG","자그레브","","Zagreb","HR","크로아티아"],
["DBV","두브로브니크","","Dubrovnik","HR","크로아티아"],
["SPU","스플리트","","Split","HR","크로아티아"],
["IST","이스탄불","","Istanbul","TR","터키"],
["SAW","이스탄불 사비하괵첸","","Istanbul Sabiha Gokcen","TR","터키"],
["AYT","안탈리아","","Antalya","TR","터키"],
["DXB","두바이","","Dubai","AE",""],
["AUH","아부다비","","Abu Dhabi","AE",""],
["DOH","도하","","Doha","QA","카타르"],
["TLV","텔아비브","","Tel Aviv","IL","이스라엘"],
["JED","제다","","Jeddah","SA","사우디"],
["RUH","리야드","","Riyadh","SA","사우디"],
["CAI","카이로","","Cairo","EG","이집트"],
["CMN","카사블랑카","","Casablanca","MA","모로코"],
["ADD","아디스아바바","","Addis Ababa","ET","에티오피아"],
["NBO","나이로비","","Nairobi","KE","케냐"],
["JNB","요하네스버그","","Johannesburg","ZA","남아공"],
["CPT","케이프타운","","Cape Town","ZA","남아공"]
].map(a => ({c: a[0], ko: a[1], sub: a[2], en: a[3], iso: a[4], keys: a[5]}));
/* AIRPORTS:END */
/* country names in Korean: the everyday short name where the formal one is long, the browser's own list for the rest */
const CC_KO = {KR: '한국', HK: '홍콩', MO: '마카오', AU: '호주'};
let regionNames = null;
try { regionNames = new Intl.DisplayNames(['ko'], {type: 'region'}); } catch (e) { /* no list here: the country code is shown as it is */ }
const ccSeen = {};
function ccName(iso) {
  if (!iso) return '';
  if (ccSeen[iso]) return ccSeen[iso];
  let name = CC_KO[iso] || '';
  if (!name) { try { name = regionNames ? regionNames.of(iso) : ''; } catch (e) { name = ''; } }
  return (ccSeen[iso] = name || iso);
}
for (const a of AP) a.cc = ccName(a.iso);
const APMAP = Object.fromEntries(AP.map(a => [a.c, a]));

/* every other airport with scheduled flights: airports.js, handed over with setAirports when a search first needs it */
const ALL = [], ALLMAP = new Map();
function setAirports(text) {
  if (typeof text !== 'string' || ALL.length) return ALL.length;
  for (const line of text.split('\n')) {
    const p = line.split('|');
    if (p.length < 4 || !/^[A-Z]{3}$/.test(p[0]) || APMAP[p[0]] || ALLMAP.has(p[0])) continue;
    const a = {c: p[0], ko: p[1], sub: p[2], en: p[1], iso: p[3], cc: '', keys: '', size: p[4] || 'S', all: true};
    ALL.push(a);
    ALLMAP.set(a.c, a);
  }
  return ALL.length;
}
const hasAllAirports = () => ALL.length > 0;
const place = c => {
  const k = code3(c);
  const a = APMAP[k] || ALLMAP.get(k);
  if (a) { if (!a.cc) a.cc = ccName(a.iso); return a; }
  return {c: k, ko: k || '?', sub: k ? '직접 넣은 공항 코드' : '', en: k, iso: '', cc: '', keys: ''};
};
const isJP = c => place(c).iso === 'JP';
const isKR = c => place(c).iso === 'KR';
/* for matching: accents off, case off, spaces and punctuation out. Hangul is split into its letters, so a half-typed syllable still matches */
const norm = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[\s\-'.,·]+/g, '');
function findPlaces(q, limit) {
  const n = norm(q), max = limit || 10;
  if (!n) return [];
  const hits = [];
  for (const a of AP) {
    if (!a.n) a.n = [a.c, a.ko, a.en, a.sub, a.cc, a.keys].map(norm);
    const h = a.n;
    let s = -1;
    if (h[0] === n) s = 0;
    else if (h[1].startsWith(n)) s = 1;
    else if (h[0].startsWith(n) || h[2].startsWith(n)) s = 2;
    else if (h.some(x => x.includes(n))) s = 3;
    if (s >= 0) hits.push([s, hits.length, a]);
  }
  for (const a of ALL) {
    if (!a.n) a.n = [a.c, a.ko, a.sub, ccName(a.iso)].map(norm);
    const h = a.n;
    let s = -1;
    if (h[0] === n) s = 0;
    else if (h[1].startsWith(n)) s = 4;
    else if (h[0].startsWith(n) || h[2].startsWith(n)) s = 5;
    else if (n.length >= 3 && (h[1].includes(n) || h[2].includes(n))) s = 6;
    else if (h[3] === n) s = 7;   // a country's name: its airports, the larger ones first
    if (s >= 0) hits.push([s + (a.size === 'L' ? 0 : a.size === 'M' ? 0.3 : 0.6), hits.length, a]);
  }
  hits.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  const out = hits.slice(0, max).map(x => x[2]);
  for (const a of out) if (!a.cc) a.cc = ccName(a.iso);
  const raw = String(q).trim().toUpperCase();
  if (/^[A-Z]{3}$/.test(raw) && !out.some(a => a.c === raw)) out.push(place(raw));
  return out;
}
/* the checker runs in Node and has the full list on disk */
if (typeof module === 'object' && module.exports && typeof require === 'function') {
  try { setAirports(require('./airports.js')); } catch (e) { /* the full list is optional */ }
}

/* ===================== Japanese holidays ===================== */
const JPCACHE = {};
function jpYear(y) {
  if (JPCACHE[y]) return JPCACHE[y];
  const H = new Map();
  const key = (m, d) => `${y}-${pad(m)}-${pad(d)}`;
  const nthMon = (m, n) => 1 + ((8 - new Date(y, m - 1, 1).getDay()) % 7) + 7 * (n - 1);
  const eq = base => Math.floor(base + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4));
  [[1, 1, '새해 첫날'], [1, nthMon(1, 2), '성인의 날'], [2, 11, '건국기념일'], [2, 23, '일왕 탄생일'],
   [3, eq(20.8431), '춘분의 날'], [4, 29, '쇼와의 날'], [5, 3, '헌법기념일'], [5, 4, '녹색의 날'], [5, 5, '어린이날'],
   [7, nthMon(7, 3), '바다의 날'], [8, 11, '산의 날'], [9, nthMon(9, 3), '경로의 날'], [9, eq(23.2488), '추분의 날'],
   [10, nthMon(10, 2), '스포츠의 날'], [11, 3, '문화의 날'], [11, 23, '근로감사의 날']
  ].forEach(h => H.set(key(h[0], h[1]), {name: h[2], legal: true}));
  const base = [...H.keys()].sort();
  for (const k of base) {            // a holiday on Sunday moves to the next free day
    if (toD(k).getDay() === 0) { let n = addDays(k, 1); while (H.has(n)) n = addDays(n, 1); H.set(n, {name: '대체휴일', legal: true}); }
  }
  for (const k of base) {            // a day between two holidays is a holiday
    const mid = addDays(k, 1), nx = addDays(k, 2);
    if (!H.has(mid) && base.includes(nx)) H.set(mid, {name: '국민의 휴일', legal: true});
  }
  [[12, 29], [12, 30], [12, 31], [1, 2], [1, 3]].forEach(a => { const k = key(a[0], a[1]); if (!H.has(k)) H.set(k, {name: '연말연시', legal: false}); });
  [[8, 13], [8, 14], [8, 15], [8, 16]].forEach(a => { const k = key(a[0], a[1]); if (!H.has(k)) H.set(k, {name: '오봉', legal: false}); });
  return (JPCACHE[y] = H);
}
const jpDay = s => isDate(s) ? (jpYear(Number(s.slice(0, 4))).get(s) || null) : null;
function jpInSpan(a, b) {
  const out = [];
  if (!isDate(a)) return out;
  const end = isDate(b) && b >= a ? b : a;
  let d = a;
  for (let i = 0; i < 62 && d <= end; i++, d = addDays(d, 1)) { const h = jpDay(d); if (h) out.push({date: d, name: h.name}); }
  return out;
}
function groupDays(list) {
  const g = [];
  for (const h of list) {
    const last = g[g.length - 1];
    if (last && last.name === h.name && addDays(last.end, 1) === h.date) last.end = h.date;
    else g.push({name: h.name, start: h.date, end: h.date});
  }
  return g;
}
function holText(hs) {
  const g = groupDays(hs);
  const parts = g.slice(0, 2).map(x => `${span(x.start, x.end)} ${x.name}`);
  return parts.join(', ') + (g.length > 2 ? ` 외 ${g.length - 2}건` : '');
}
/* runs of days off in Japan (weekend or holiday) that contain at least one holiday */
function jpBlocks(from, limit) {
  const out = [];
  let d = from, run = null;
  for (let i = 0; i < 430 && out.length < limit; i++, d = addDays(d, 1)) {
    const dow = toD(d).getDay(), h = jpDay(d);
    if (h || dow === 0 || dow === 6) {
      if (!run) run = {start: d, end: d, names: []};
      run.end = d;
      if (h && !run.names.includes(h.name)) run.names.push(h.name);
    } else { if (run && run.names.length) out.push(run); run = null; }
  }
  return out;
}
const blockTrip = (b, nights) => ({dep: b.start, ret: b.end > b.start ? b.end : addDays(b.start, Math.max(1, nights || 2))});

/* ===================== links to sites ===================== */
const SKY = {SEL: 'sela', TYO: 'tyoa', OSA: 'osaa'};
const TRIPC = {ICN: 'sel', GMP: 'sel', NRT: 'tyo', HND: 'tyo', KIX: 'osa', ITM: 'osa', UKB: 'osa', CTS: 'spk', PVG: 'sha', PEK: 'bjs', TSA: 'tpe', DMK: 'bkk'};
const y6 = d => d.slice(2).replace(/-/g, '');
const y8 = d => d.replace(/-/g, '');
const L = {
  skyscanner(x, jp) {
    const o = (SKY[x.from] || x.from).toLowerCase(), d = (SKY[x.to] || x.to).toLowerCase();
    return `https://www.skyscanner.${jp ? 'jp' : 'co.kr'}/transport/flights/${o}/${d}/${y6(x.dep)}/${x.ret ? y6(x.ret) + '/' : ''}?adultsv2=1&cabinclass=economy&rtn=${x.ret ? 1 : 0}`;
  },
  naver(x) {
    if (isKR(x.from) && isKR(x.to)) return 'https://flight.naver.com/';
    return `https://flight.naver.com/flights/international/${x.from}-${x.to}-${y8(x.dep)}${x.ret ? `/${x.to}-${x.from}-${y8(x.ret)}` : ''}?adult=1&fareType=Y`;
  },
  google(x) {
    const nm = c => (['SEL', 'TYO', 'OSA'].includes(c) ? place(c).en : c);
    const q = `Flights from ${nm(x.from)} to ${nm(x.to)} on ${x.dep}${x.ret ? ` through ${x.ret}` : ' one way'}`;
    return `https://www.google.com/travel/flights?q=${encodeURIComponent(q)}&hl=ko&gl=KR&curr=KRW`;
  },
  kayak(x) { return `https://www.kayak.co.kr/flights/${x.from}-${x.to}/${x.dep}${x.ret ? '/' + x.ret : ''}?sort=price_a`; },
  trip(x) {
    const o = (TRIPC[x.from] || x.from).toLowerCase(), d = (TRIPC[x.to] || x.to).toLowerCase();
    return `https://kr.trip.com/flights/showfarefirst?dcity=${o}&acity=${d}&ddate=${x.dep}${x.ret ? `&rdate=${x.ret}&triptype=rt` : '&triptype=ow'}&class=y&quantity=1&locale=ko-KR&curr=KRW`;
  },
  airtrip(x) {
    const city = c => ['SEL', 'TYO', 'OSA'].includes(c);
    return (isJP(x.from) && isJP(x.to) && !city(x.from) && !city(x.to)) ? `https://www.airtrip.jp/flight/${x.from}/${x.to}/` : 'https://www.airtrip.jp/';
  }
};
const AIRLINES = [
  ['제주항공', 'https://www.jejuair.net/', ['제주', 'jeju']],
  ['진에어', 'https://www.jinair.com/', ['진에어', 'jin air', 'jinair']],
  ['트리니티항공', 'https://www.trinityairways.com/', ['트리니티', '티웨이', 'trinity', 'tway']],
  ['이스타항공', 'https://www.eastarjet.com/', ['이스타', 'eastar']],
  ['에어서울', 'https://flyairseoul.com/', ['에어서울', 'air seoul']],
  ['에어부산', 'https://www.airbusan.com/', ['에어부산', 'air busan']],
  ['대한항공', 'https://www.koreanair.com/', ['대한항공', 'korean air']],
  ['아시아나항공', 'https://flyasiana.com/', ['아시아나', 'asiana']],
  ['에어로케이', 'https://www.aerok.com/', ['에어로케이', 'aero k', 'aerok']],
  ['피치', 'https://www.flypeach.com/', ['피치', 'peach']],
  ['스카이마크', 'https://www.skymark.co.jp/', ['스카이마크', 'skymark']],
  ['솔라시드에어', 'https://www.solaseedair.jp/', ['솔라시드', 'solaseed']],
  ['일본항공', 'https://www.jal.co.jp/', ['일본항공', 'jal']],
  ['전일본공수', 'https://www.ana.co.jp/', ['전일본', 'ana']]
];
function airlineSite(name) {
  const n = String(name || '').toLowerCase();
  if (!n) return null;
  for (const a of AIRLINES) {
    for (const k of a[2]) {
      const ascii = /^[a-z ]+$/.test(k);
      if (ascii ? new RegExp('(^|[^a-z])' + k + '([^a-z]|$)').test(n) : n.includes(k)) return {n: a[0], u: a[1]};
    }
  }
  return null;
}

/* ===================== routes and found fares ===================== */
const isChain = r => !!r && r.trip === 'chain' && !!code3(r.via);
/* the flights a watched item is made of: one for a simple route, two or three for a trip that continues on */
function legsOf(r) {
  const f = code3(r.from), t = code3(r.to), v = code3(r.via);
  if (!isChain(r)) return [{from: f, to: t}];
  const legs = [{from: f, to: v}, {from: v, to: t}];
  if (r.back !== false) legs.push({from: t, to: f});
  return legs;
}
const routeLabel = r => isChain(r)
  ? `${place(r.from).ko} → ${place(r.via).ko} → ${place(r.to).ko}`
  : `${place(r.from).ko} → ${place(r.to).ko}`;
const tripLabel = r => isChain(r) ? (r.back !== false ? '이어 가기, 돌아오는 편 포함' : '이어 가기') : (r.trip === 'ow' ? '편도' : '왕복');

function readLeg(o) {
  if (!o || typeof o !== 'object') return null;
  const price = posNum(o.price);
  if (!price || !isDate(o.dep)) return null;
  return {price, dep: o.dep, airline: str(o.airline, 30), from: code3(o.from), to: code3(o.to), src: str(o.src, 20), jpy: posNum(o.jpy)};
}
function readDeal(o) {
  if (!o || typeof o !== 'object') return null;
  const price = posNum(o.price);
  if (!price) return null;
  let legs = null;
  if (Array.isArray(o.legs)) {
    legs = o.legs.slice(0, 4).map(readLeg);
    if (!legs.length || legs.some(x => !x)) return null;
  }
  return {
    price, airline: str(o.airline, 30),
    dep: isDate(o.dep) ? o.dep : (legs ? legs[0].dep : ''),
    ret: isDate(o.ret) ? o.ret : (legs ? legs[legs.length - 1].dep : ''),
    from: code3(o.from), to: code3(o.to), src: str(o.src, 20), legs
  };
}
/* split what a check found into trips with and without a Japanese holiday, cheapest first */
function classify(r, p, t) {
  t = t || today();
  const src = p && Array.isArray(p.cands) ? p.cands.slice(0, 60) : [];
  const chain = isChain(r), ow = r.trip === 'ow';
  const need = chain ? legsOf(r).length : 0;
  const list = [];
  const seen = new Set();
  for (const raw of src) {
    const d = readDeal(raw);
    if (!d || !d.dep || d.dep < t) continue;
    if (chain) { if (!d.legs || d.legs.length !== need) continue; }
    else if (d.legs) continue;
    if (!ow && (!d.ret || d.ret < d.dep)) continue;
    if (isDate(r.winFrom) && d.dep < r.winFrom) continue;
    if (isDate(r.winTo) && d.dep > r.winTo) continue;
    const k = chain ? d.legs.map(x => x.dep + x.airline + x.price).join('|') : [d.dep, ow ? '' : d.ret, d.airline, d.price].join('|');
    if (seen.has(k)) continue;
    seen.add(k);
    const hs = jpInSpan(d.dep, ow ? d.dep : d.ret);
    list.push(Object.assign(d, {hs, ret: ow ? '' : d.ret}));
  }
  list.sort((a, b) => a.price - b.price);
  return {norm: list.filter(x => !x.hs.length), hol: list.filter(x => x.hs.length)};
}
/* join one-way fares into trips whose dates follow on: a night or more at each stop,
   and not much longer than the planned stay */
function buildCombos(r, legDeals, t, perClass) {
  const legs = legsOf(r);
  if (!isChain(r) || !Array.isArray(legDeals) || legDeals.length !== legs.length) return [];
  t = t || today();
  const viaN = Math.max(1, Math.round(Number(r.viaNights) || 2));
  const stayN = Math.max(1, Math.round(Number(r.nights) || 3));
  const viaMax = viaN * 2 + 1, stayMax = stayN * 2 + 1;   // a stay may run to about twice the plan, never less than a night
  const clean = legDeals.map((list, i) => (Array.isArray(list) ? list : []).map(readLeg).filter(x => x && x.dep >= t)
    .map(x => Object.assign(x, {from: x.from || legs[i].from, to: x.to || legs[i].to})));
  const A = clean[0].filter(a => (!isDate(r.winFrom) || a.dep >= r.winFrom) && (!isDate(r.winTo) || a.dep <= r.winTo));
  const B = clean[1], C = legs.length === 3 ? clean[2] : null;
  const sets = [];
  for (const a of A) for (const b of B) {
    const g1 = diffDays(a.dep, b.dep);
    if (g1 < 1 || g1 > viaMax) continue;
    if (!C) { sets.push([a, b]); continue; }
    for (const c of C) { const g2 = diffDays(b.dep, c.dep); if (g2 >= 1 && g2 <= stayMax) sets.push([a, b, c]); }
  }
  const all = sets.map(ls => {
    const first = ls[0].dep, last = ls[ls.length - 1].dep;
    return {
      price: ls.reduce((s, x) => s + x.price, 0), dep: first, ret: last, airline: '구간 조합',
      from: legs[0].from, to: code3(r.to), src: '조합', legs: ls,
      off: Math.abs(diffDays(ls[0].dep, ls[1].dep) - viaN) + (ls[2] ? Math.abs(diffDays(ls[1].dep, ls[2].dep) - stayN) : 0),
      hol: jpInSpan(first, last).length > 0
    };
  }).sort((x, y) => x.price - y.price || x.off - y.off);
  const seen = new Set(), scored = [];   // one entry per pair of outer dates and airlines: the middle flight only shifts
  for (const x of all) {
    const k = [x.dep, x.ret, x.legs[0].airline, x.legs[x.legs.length - 1].airline].join('|');
    if (!seen.has(k)) { seen.add(k); scored.push(x); }
  }
  const pick = h => scored.filter(x => x.hol === h).slice(0, perClass || 6);
  return pick(false).concat(pick(true)).map(x => { const y = Object.assign({}, x); delete y.off; delete y.hol; return y; });
}

return {
  pad, won, isDate, toD, fromD, today, todayIn, addDays, diffDays, md, span, stamp, httpUrl, posNum, str, code3, batchim, iga, ieyo,
  AP, place, isJP, isKR, findPlaces, setAirports, hasAllAirports, ccName,
  jpYear, jpDay, jpInSpan, groupDays, holText, jpBlocks, blockTrip,
  L, AIRLINES, airlineSite,
  isChain, legsOf, routeLabel, tripLabel, readLeg, readDeal, classify, buildCombos
};
});
