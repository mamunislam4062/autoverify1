const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

const startMarker = '<!-- ====== LANGUAGE SYSTEM JS ====== -->';
const startIdx = html.indexOf(startMarker);
const scriptOpenIdx = html.indexOf('<script>', startIdx);
const scriptCloseIdx = html.indexOf('</script>', scriptOpenIdx + 8) + '</script>'.length;

const before = html.slice(0, startIdx);
const after = html.slice(scriptCloseIdx);

const newScript = `<!-- ====== LANGUAGE SYSTEM JS ====== -->
        <script>
            // ─── Language Definitions ─────────────────────────────────────────────────
            const LANGUAGES = [
                { code: 'en', flag: '🇬🇧', name: 'English',    native: 'English',          dir: 'ltr' },
                { code: 'bn', flag: '🇧🇩', name: 'Bengali',     native: 'বাংলা',             dir: 'ltr' },
                { code: 'ar', flag: '🇸🇦', name: 'Arabic',      native: 'العربية',           dir: 'rtl' },
                { code: 'hi', flag: '🇮🇳', name: 'Hindi',       native: 'हिन्दी',            dir: 'ltr' },
                { code: 'fr', flag: '🇫🇷', name: 'French',      native: 'Français',          dir: 'ltr' },
                { code: 'es', flag: '🇪🇸', name: 'Spanish',     native: 'Español',           dir: 'ltr' },
                { code: 'de', flag: '🇩🇪', name: 'German',      native: 'Deutsch',           dir: 'ltr' },
                { code: 'ru', flag: '🇷🇺', name: 'Russian',     native: 'Русский',           dir: 'ltr' },
                { code: 'zh', flag: '🇨🇳', name: 'Chinese',     native: '中文',              dir: 'ltr' },
                { code: 'tr', flag: '🇹🇷', name: 'Turkish',     native: 'Türkçe',            dir: 'ltr' },
                { code: 'pt', flag: '🇧🇷', name: 'Portuguese',  native: 'Português',         dir: 'ltr' },
                { code: 'id', flag: '🇮🇩', name: 'Indonesian',  native: 'Bahasa Indonesia',  dir: 'ltr' },
            ];

            // ─── Translations ─────────────────────────────────────────────────────────
            const TRANSLATIONS = {
                en: {
                    appName:'Auto Verify', welcomeBack:'WELCOME BACK,', tokensLabel:'Tokens', gemsLabel:'Gems',
                    daily:'Daily', verify:'Verify', service:'Service', tasks:'Tasks', invite:'Invite',
                    history:'History', deposit:'Deposit', earn:'Earn', accounts:'Accounts',
                    email:'Email', redeemTokens:'Redeem Tokens',
                    redeemSub:'Enter your code to get tokens', recentActivity:'Recent Activity', seeAll:'SEE ALL',
                    language:'Language', selectLang:'Select Language', chooseLang:'Choose your preferred language',
                    home:'Home', shop:'Shop', profile:'Profile', verification:'Verification', services:'Services',
                    leaderboard:'Leaderboard', exchange:'Exchange', redeemCode:'Redeem Code',
                    inviteEarn:'Invite & Earn', supportTeam:'Support Team',
                    support:'Support Team', appearance:'Appearance', themeDark:'THEME: DARK MODE',
                    accountStatus:'Account Status', displaySecurity:'DISPLAY & SECURITY',
                    totalAssets:'Total Assets', estimatedValue:'ESTIMATED VALUE',
                    applyVerify:'APPLY FOR VERIFICATION', earnFreeTokens:'Earn Free Tokens',
                    yourReferral:'Your Referral Link', invited:'INVITED', earned:'EARNED',
                    topRefs:'TOP 10 REFERRERS', globalRanking:'Global Ranking', needHelp:'Need Help?',
                    msgSupport:'MESSAGE SUPPORT DIRECTLY', availableItems:'AVAILABLE ITEMS',
                    claimReward:'CLAIM REWARD', dailyBonus:'Daily Bonus', nextClaim:'NEXT CLAIM IN:',
                    missionCenter:'MISSION CENTER', howToEarn:'HOW TO EARN',
                    yourInboxEmpty:'Your inbox is empty', waitingEmails:'Waiting for incoming emails',
                    close:'CLOSE', copyAll:'COPY ALL',
                },
                bn: {
                    appName:'অটো ভেরিফাই', welcomeBack:'স্বাগত ফিরে,', tokensLabel:'টোকেন', gemsLabel:'জেম',
                    daily:'ডেইলি', verify:'ভেরিফাই', service:'সার্ভিস', tasks:'টাস্ক', invite:'আমন্ত্রণ',
                    history:'ইতিহাস', deposit:'ডিপোজিট', earn:'উপার্জন', accounts:'একাউন্ট',
                    email:'ইমেইল', redeemTokens:'টোকেন রিডিম করুন',
                    redeemSub:'টোকেন পেতে কোড দিন', recentActivity:'সাম্প্রতিক কার্যক্রম', seeAll:'সব দেখুন',
                    language:'ভাষা', selectLang:'ভাষা নির্বাচন করুন', chooseLang:'আপনার পছন্দের ভাষা বেছে নিন',
                    home:'হোম', shop:'শপ', profile:'প্রোফাইল', verification:'ভেরিফিকেশন', services:'সার্ভিস',
                    leaderboard:'লিডারবোর্ড', exchange:'এক্সচেঞ্জ', redeemCode:'রিডিম কোড',
                    inviteEarn:'আমন্ত্রণ ও উপার্জন', supportTeam:'সাপোর্ট টিম',
                    support:'সাপোর্ট টিম', appearance:'থিম', themeDark:'থিম: ডার্ক মোড',
                    accountStatus:'অ্যাকাউন্ট স্ট্যাটাস', displaySecurity:'ডিসপ্লে ও সিকিউরিটি',
                    totalAssets:'মোট সম্পদ', estimatedValue:'আনুমানিক মূল্য',
                    applyVerify:'ভেরিফিকেশনের জন্য আবেদন করুন', earnFreeTokens:'বিনামূল্যে টোকেন উপার্জন',
                    yourReferral:'আপনার রেফারেল লিংক', invited:'আমন্ত্রিত', earned:'উপার্জিত',
                    topRefs:'শীর্ষ ১০ রেফারার', globalRanking:'গ্লোবাল র‍্যাংকিং', needHelp:'সাহায্য দরকার?',
                    msgSupport:'সরাসরি সাপোর্টে বার্তা দিন', availableItems:'পাওয়া যাচ্ছে',
                    claimReward:'পুরস্কার নিন', dailyBonus:'ডেইলি বোনাস', nextClaim:'পরবর্তী দাবি:',
                    missionCenter:'মিশন সেন্টার', howToEarn:'কীভাবে উপার্জন করবেন',
                    yourInboxEmpty:'ইনবক্স খালি', waitingEmails:'ইমেইলের অপেক্ষায়',
                    close:'বন্ধ করুন', copyAll:'সব কপি করুন',
                },
                ar: {
                    appName:'التحقق التلقائي', welcomeBack:'مرحبًا بعودتك،', tokensLabel:'رموز', gemsLabel:'جواهر',
                    daily:'يومي', verify:'تحقق', service:'خدمة', tasks:'المهام', invite:'دعوة',
                    history:'السجل', deposit:'إيداع', earn:'كسب', accounts:'الحسابات',
                    email:'بريد', redeemTokens:'استرداد الرموز',
                    redeemSub:'أدخل الكود للحصول على رموز', recentActivity:'النشاط الأخير', seeAll:'عرض الكل',
                    language:'اللغة', selectLang:'اختر اللغة', chooseLang:'اختر لغتك المفضلة',
                    home:'الرئيسية', shop:'المتجر', profile:'الملف', verification:'التحقق', services:'الخدمات',
                    leaderboard:'لوحة المتصدرين', exchange:'تبادل', redeemCode:'استرداد الكود',
                    inviteEarn:'دعوة واكسب', supportTeam:'فريق الدعم',
                    support:'فريق الدعم', appearance:'المظهر', themeDark:'السمة: الوضع الداكن',
                    accountStatus:'حالة الحساب', displaySecurity:'العرض والأمان',
                    totalAssets:'إجمالي الأصول', estimatedValue:'القيمة التقديرية',
                    applyVerify:'تقديم للتحقق', earnFreeTokens:'اكسب رموزاً مجاناً',
                    yourReferral:'رابط الإحالة', invited:'مدعو', earned:'مكتسب',
                    topRefs:'أعلى 10 محيلين', globalRanking:'الترتيب العالمي', needHelp:'تحتاج مساعدة؟',
                    msgSupport:'راسل الدعم مباشرة', availableItems:'العناصر المتاحة',
                    claimReward:'احصل على المكافأة', dailyBonus:'مكافأة يومية', nextClaim:'الطلب التالي:',
                    missionCenter:'مركز المهام', howToEarn:'كيفية الكسب',
                    yourInboxEmpty:'صندوقك فارغ', waitingEmails:'في انتظار رسائل',
                    close:'إغلاق', copyAll:'نسخ الكل',
                },
                hi: {
                    appName:'ऑटो वेरीफाई', welcomeBack:'वापसी पर स्वागत,', tokensLabel:'टोकन', gemsLabel:'रत्न',
                    daily:'दैनिक', verify:'सत्यापित', service:'सेवा', tasks:'कार्य', invite:'आमंत्रण',
                    history:'इतिहास', deposit:'जमा', earn:'कमाएं', accounts:'खाते',
                    email:'ईमेल', redeemTokens:'टोकन रिडीम करें',
                    redeemSub:'टोकन पाने के लिए कोड दर्ज करें', recentActivity:'हाल की गतिविधि', seeAll:'सब देखें',
                    language:'भाषा', selectLang:'भाषा चुनें', chooseLang:'अपनी पसंदीदा भाषा चुनें',
                    home:'होम', shop:'दुकान', profile:'प्रोफ़ाइल', verification:'सत्यापन', services:'सेवाएं',
                    leaderboard:'लीडरबोर्ड', exchange:'एक्सचेंज', redeemCode:'कोड रिडीम',
                    inviteEarn:'आमंत्रित करें और कमाएं', supportTeam:'सहायता टीम',
                    support:'सहायता टीम', appearance:'दिखावट', themeDark:'थीम: डार्क मोड',
                    accountStatus:'खाता स्थिति', displaySecurity:'प्रदर्शन और सुरक्षा',
                    totalAssets:'कुल संपत्ति', estimatedValue:'अनुमानित मूल्य',
                    applyVerify:'सत्यापन के लिए आवेदन करें', earnFreeTokens:'मुफ्त टोकन कमाएं',
                    yourReferral:'आपका रेफरल लिंक', invited:'आमंत्रित', earned:'अर्जित',
                    topRefs:'शीर्ष 10 रेफरर', globalRanking:'वैश्विक रैंकिंग', needHelp:'मदद चाहिए?',
                    msgSupport:'सीधे सहायता को संदेश भेजें', availableItems:'उपलब्ध आइटम',
                    claimReward:'पुरस्कार लें', dailyBonus:'दैनिक बोनस', nextClaim:'अगला दावा:',
                    missionCenter:'मिशन सेंटर', howToEarn:'कैसे कमाएं',
                    yourInboxEmpty:'इनबॉक्स खाली है', waitingEmails:'ईमेल का इंतजार',
                    close:'बंद करें', copyAll:'सब कॉपी करें',
                },
                fr: {
                    appName:'Vérification Auto', welcomeBack:'BON RETOUR,', tokensLabel:'Jetons', gemsLabel:'Gemmes',
                    daily:'Quotidien', verify:'Vérifier', service:'Service', tasks:'Tâches', invite:'Inviter',
                    history:'Historique', deposit:'Dépôt', earn:'Gagner', accounts:'Comptes',
                    email:'E-mail', redeemTokens:'Obtenir des jetons',
                    redeemSub:'Entrez votre code pour obtenir des jetons', recentActivity:'Activité récente', seeAll:'VOIR TOUT',
                    language:'Langue', selectLang:'Sélectionner la langue', chooseLang:'Choisissez votre langue préférée',
                    home:'Accueil', shop:'Boutique', profile:'Profil', verification:'Vérification', services:'Services',
                    leaderboard:'Classement', exchange:'Échange', redeemCode:'Code cadeau',
                    inviteEarn:'Inviter & Gagner', supportTeam:'Équipe support',
                    support:'Équipe support', appearance:'Apparence', themeDark:'THÈME: MODE SOMBRE',
                    accountStatus:'Statut du compte', displaySecurity:'AFFICHAGE & SÉCURITÉ',
                    totalAssets:'Total des actifs', estimatedValue:'VALEUR ESTIMÉE',
                    applyVerify:'DEMANDER LA VÉRIFICATION', earnFreeTokens:'Gagnez des jetons gratuits',
                    yourReferral:'Votre lien de parrainage', invited:'INVITÉ', earned:'GAGNÉ',
                    topRefs:'TOP 10 PARRAINS', globalRanking:'Classement mondial', needHelp:"Besoin d'aide?",
                    msgSupport:'CONTACTER LE SUPPORT', availableItems:'ARTICLES DISPONIBLES',
                    claimReward:'RÉCLAMER', dailyBonus:'Bonus quotidien', nextClaim:'PROCHAIN CLAIM:',
                    missionCenter:'CENTRE DE MISSION', howToEarn:'COMMENT GAGNER',
                    yourInboxEmpty:"Votre boîte est vide", waitingEmails:"En attente d'emails",
                    close:'FERMER', copyAll:'TOUT COPIER',
                },
                es: {
                    appName:'Verificación Auto', welcomeBack:'BIENVENIDO DE VUELTA,', tokensLabel:'Fichas', gemsLabel:'Gemas',
                    daily:'Diario', verify:'Verificar', service:'Servicio', tasks:'Tareas', invite:'Invitar',
                    history:'Historial', deposit:'Depósito', earn:'Ganar', accounts:'Cuentas',
                    email:'Correo', redeemTokens:'Canjear Tokens',
                    redeemSub:'Ingresa tu código para obtener tokens', recentActivity:'Actividad reciente', seeAll:'VER TODO',
                    language:'Idioma', selectLang:'Seleccionar idioma', chooseLang:'Elige tu idioma preferido',
                    home:'Inicio', shop:'Tienda', profile:'Perfil', verification:'Verificación', services:'Servicios',
                    leaderboard:'Clasificación', exchange:'Intercambio', redeemCode:'Canjear código',
                    inviteEarn:'Invitar & Ganar', supportTeam:'Soporte',
                    support:'Soporte', appearance:'Apariencia', themeDark:'TEMA: MODO OSCURO',
                    accountStatus:'Estado de cuenta', displaySecurity:'PANTALLA & SEGURIDAD',
                    totalAssets:'Activos totales', estimatedValue:'VALOR ESTIMADO',
                    applyVerify:'SOLICITAR VERIFICACIÓN', earnFreeTokens:'Gana tokens gratis',
                    yourReferral:'Tu enlace de referido', invited:'INVITADO', earned:'GANADO',
                    topRefs:'TOP 10 REFERIDORES', globalRanking:'Clasificación global', needHelp:'¿Necesitas ayuda?',
                    msgSupport:'CONTACTAR SOPORTE', availableItems:'ARTÍCULOS DISPONIBLES',
                    claimReward:'RECLAMAR', dailyBonus:'Bono diario', nextClaim:'PRÓXIMA:',
                    missionCenter:'CENTRO DE MISIONES', howToEarn:'CÓMO GANAR',
                    yourInboxEmpty:'Tu bandeja está vacía', waitingEmails:'Esperando correos',
                    close:'CERRAR', copyAll:'COPIAR TODO',
                },
                de: {
                    appName:'Auto Verifizierung', welcomeBack:'WILLKOMMEN ZURÜCK,', tokensLabel:'Token', gemsLabel:'Edelsteine',
                    daily:'Täglich', verify:'Verifizieren', service:'Service', tasks:'Aufgaben', invite:'Einladen',
                    history:'Verlauf', deposit:'Einzahlung', earn:'Verdienen', accounts:'Konten',
                    email:'E-Mail', redeemTokens:'Token Einlösen',
                    redeemSub:'Code eingeben für Token', recentActivity:'Letzte Aktivität', seeAll:'ALLE SEHEN',
                    language:'Sprache', selectLang:'Sprache auswählen', chooseLang:'Wählen Sie Ihre bevorzugte Sprache',
                    home:'Start', shop:'Shop', profile:'Profil', verification:'Verifizierung', services:'Dienste',
                    leaderboard:'Rangliste', exchange:'Tausch', redeemCode:'Code einlösen',
                    inviteEarn:'Einladen & Verdienen', supportTeam:'Support-Team',
                    support:'Support-Team', appearance:'Erscheinungsbild', themeDark:'DESIGN: DUNKELMODUS',
                    accountStatus:'Kontostatus', displaySecurity:'ANZEIGE & SICHERHEIT',
                    totalAssets:'Gesamtvermögen', estimatedValue:'GESCHÄTZTER WERT',
                    applyVerify:'FÜR VERIFIZIERUNG BEWERBEN', earnFreeTokens:'Kostenlose Token verdienen',
                    yourReferral:'Ihr Empfehlungslink', invited:'EINGELADEN', earned:'VERDIENT',
                    topRefs:'TOP 10 WERBER', globalRanking:'Globales Ranking', needHelp:'Brauchen Sie Hilfe?',
                    msgSupport:'SUPPORT KONTAKTIEREN', availableItems:'VERFÜGBARE ARTIKEL',
                    claimReward:'BELOHNUNG BEANSPRUCHEN', dailyBonus:'Täglicher Bonus', nextClaim:'NÄCHSTE:',
                    missionCenter:'MISSIONSZENTRUM', howToEarn:'WIE MAN VERDIENT',
                    yourInboxEmpty:'Ihr Posteingang ist leer', waitingEmails:'Warte auf E-Mails',
                    close:'SCHLIESSEN', copyAll:'ALLES KOPIEREN',
                },
                ru: {
                    appName:'Авто Верификация', welcomeBack:'С ВОЗВРАЩЕНИЕМ,', tokensLabel:'Токены', gemsLabel:'Самоцветы',
                    daily:'Ежедневно', verify:'Верифицировать', service:'Сервис', tasks:'Задачи', invite:'Пригласить',
                    history:'История', deposit:'Депозит', earn:'Зарабатывать', accounts:'Аккаунты',
                    email:'Почта', redeemTokens:'Получить Токены',
                    redeemSub:'Введите код для получения токенов', recentActivity:'Последняя активность', seeAll:'ВСЕ',
                    language:'Язык', selectLang:'Выбрать язык', chooseLang:'Выберите предпочтительный язык',
                    home:'Главная', shop:'Магазин', profile:'Профиль', verification:'Верификация', services:'Сервисы',
                    leaderboard:'Рейтинг', exchange:'Обмен', redeemCode:'Промокод',
                    inviteEarn:'Приглашай и зарабатывай', supportTeam:'Служба поддержки',
                    support:'Служба поддержки', appearance:'Внешний вид', themeDark:'ТЕМА: ТЁМНЫЙ РЕЖИМ',
                    accountStatus:'Статус аккаунта', displaySecurity:'ДИСПЛЕЙ И БЕЗОПАСНОСТЬ',
                    totalAssets:'Всего активов', estimatedValue:'РАСЧЁТНАЯ СТОИМОСТЬ',
                    applyVerify:'ПОДАТЬ НА ВЕРИФИКАЦИЮ', earnFreeTokens:'Зарабатывайте токены бесплатно',
                    yourReferral:'Ваша реферальная ссылка', invited:'ПРИГЛАШЕНО', earned:'ЗАРАБОТАНО',
                    topRefs:'ТОП 10 РЕФЕРЕРОВ', globalRanking:'Глобальный рейтинг', needHelp:'Нужна помощь?',
                    msgSupport:'НАПИСАТЬ В ПОДДЕРЖКУ', availableItems:'ДОСТУПНЫЕ ТОВАРЫ',
                    claimReward:'ЗАБРАТЬ НАГРАДУ', dailyBonus:'Ежедневный бонус', nextClaim:'СЛЕДУЮЩИЙ:',
                    missionCenter:'ЦЕНТР МИССИЙ', howToEarn:'КАК ЗАРАБАТЫВАТЬ',
                    yourInboxEmpty:'Ваш ящик пуст', waitingEmails:'Ожидание писем',
                    close:'ЗАКРЫТЬ', copyAll:'КОПИРОВАТЬ ВСЁ',
                },
                zh: {
                    appName:'自动验证', welcomeBack:'欢迎回来，', tokensLabel:'代币', gemsLabel:'宝石',
                    daily:'每日', verify:'验证', service:'服务', tasks:'任务', invite:'邀请',
                    history:'历史', deposit:'存款', earn:'赚取', accounts:'账户',
                    email:'邮件', redeemTokens:'兑换代币',
                    redeemSub:'输入代码获取代币', recentActivity:'最近活动', seeAll:'全部',
                    language:'语言', selectLang:'选择语言', chooseLang:'选择您首选的语言',
                    home:'主页', shop:'商店', profile:'个人资料', verification:'验证', services:'服务',
                    leaderboard:'排行榜', exchange:'兑换', redeemCode:'兑换码',
                    inviteEarn:'邀请&赚取', supportTeam:'支持团队',
                    support:'支持团队', appearance:'外观', themeDark:'主题: 深色模式',
                    accountStatus:'账户状态', displaySecurity:'显示与安全',
                    totalAssets:'总资产', estimatedValue:'估计价值',
                    applyVerify:'申请验证', earnFreeTokens:'免费赚取代币',
                    yourReferral:'您的推荐链接', invited:'已邀请', earned:'已赚取',
                    topRefs:'前10名推荐人', globalRanking:'全球排名', needHelp:'需要帮助?',
                    msgSupport:'直接联系支持', availableItems:'可用商品',
                    claimReward:'领取奖励', dailyBonus:'每日奖励', nextClaim:'下次领取:',
                    missionCenter:'任务中心', howToEarn:'如何赚取',
                    yourInboxEmpty:'您的邮箱是空的', waitingEmails:'等待收件',
                    close:'关闭', copyAll:'全部复制',
                },
                tr: {
                    appName:'Otomatik Doğrulama', welcomeBack:'HOŞ GELDİNİZ,', tokensLabel:'Token', gemsLabel:'Mücevher',
                    daily:'Günlük', verify:'Doğrula', service:'Servis', tasks:'Görevler', invite:'Davet',
                    history:'Geçmiş', deposit:'Yatırım', earn:'Kazan', accounts:'Hesaplar',
                    email:'E-posta', redeemTokens:'Token Al',
                    redeemSub:'Token almak için kodu girin', recentActivity:'Son Aktiviteler', seeAll:'HEPSİ',
                    language:'Dil', selectLang:'Dil Seç', chooseLang:'Tercih ettiğiniz dili seçin',
                    home:'Ana Sayfa', shop:'Mağaza', profile:'Profil', verification:'Doğrulama', services:'Servisler',
                    leaderboard:'Sıralama', exchange:'Takas', redeemCode:'Kodu Kullan',
                    inviteEarn:'Davet Et & Kazan', supportTeam:'Destek Ekibi',
                    support:'Destek Ekibi', appearance:'Görünüm', themeDark:'TEMA: KARANLIK MOD',
                    accountStatus:'Hesap Durumu', displaySecurity:'EKRAN VE GÜVENLİK',
                    totalAssets:'Toplam Varlık', estimatedValue:'TAHMİNİ DEĞER',
                    applyVerify:'DOĞRULAMA İÇİN BAŞVUR', earnFreeTokens:'Ücretsiz Token Kazan',
                    yourReferral:'Referans Bağlantınız', invited:'DAVET EDİLEN', earned:'KAZANILAN',
                    topRefs:'EN İYİ 10 REFERANS', globalRanking:'Küresel Sıralama', needHelp:'Yardım lazım mı?',
                    msgSupport:'DOĞRUDAN DESTEĞE YAZ', availableItems:'MEVCUT ÜRÜNLER',
                    claimReward:'ÖDÜL AL', dailyBonus:'Günlük Bonus', nextClaim:'SONRAKİ:',
                    missionCenter:'GÖREV MERKEZİ', howToEarn:'NASIL KAZANILIR',
                    yourInboxEmpty:'Gelen kutunuz boş', waitingEmails:'E-posta bekleniyor',
                    close:'KAPAT', copyAll:'HEPSİNİ KOPYALA',
                },
                pt: {
                    appName:'Verificação Auto', welcomeBack:'BEM-VINDO DE VOLTA,', tokensLabel:'Fichas', gemsLabel:'Gemas',
                    daily:'Diário', verify:'Verificar', service:'Serviço', tasks:'Tarefas', invite:'Convidar',
                    history:'Histórico', deposit:'Depósito', earn:'Ganhar', accounts:'Contas',
                    email:'E-mail', redeemTokens:'Resgatar Tokens',
                    redeemSub:'Digite seu código para obter tokens', recentActivity:'Atividade recente', seeAll:'VER TUDO',
                    language:'Idioma', selectLang:'Selecionar idioma', chooseLang:'Escolha seu idioma preferido',
                    home:'Início', shop:'Loja', profile:'Perfil', verification:'Verificação', services:'Serviços',
                    leaderboard:'Classificação', exchange:'Troca', redeemCode:'Resgatar código',
                    inviteEarn:'Convidar & Ganhar', supportTeam:'Suporte',
                    support:'Suporte', appearance:'Aparência', themeDark:'TEMA: MODO ESCURO',
                    accountStatus:'Status da conta', displaySecurity:'EXIBIÇÃO & SEGURANÇA',
                    totalAssets:'Total de ativos', estimatedValue:'VALOR ESTIMADO',
                    applyVerify:'SOLICITAR VERIFICAÇÃO', earnFreeTokens:'Ganhe tokens grátis',
                    yourReferral:'Seu link de indicação', invited:'CONVIDADO', earned:'GANHO',
                    topRefs:'TOP 10 INDICADORES', globalRanking:'Ranking global', needHelp:'Precisa de ajuda?',
                    msgSupport:'CONTATAR SUPORTE', availableItems:'ITENS DISPONÍVEIS',
                    claimReward:'RESGATAR', dailyBonus:'Bônus diário', nextClaim:'PRÓXIMO:',
                    missionCenter:'CENTRO DE MISSÕES', howToEarn:'COMO GANHAR',
                    yourInboxEmpty:'Sua caixa está vazia', waitingEmails:'Aguardando e-mails',
                    close:'FECHAR', copyAll:'COPIAR TUDO',
                },
                id: {
                    appName:'Verifikasi Otomatis', welcomeBack:'SELAMAT DATANG KEMBALI,', tokensLabel:'Token', gemsLabel:'Permata',
                    daily:'Harian', verify:'Verifikasi', service:'Layanan', tasks:'Tugas', invite:'Undang',
                    history:'Riwayat', deposit:'Setor', earn:'Dapatkan', accounts:'Akun',
                    email:'Email', redeemTokens:'Tukar Token',
                    redeemSub:'Masukkan kode untuk mendapatkan token', recentActivity:'Aktivitas Terbaru', seeAll:'LIHAT SEMUA',
                    language:'Bahasa', selectLang:'Pilih Bahasa', chooseLang:'Pilih bahasa yang Anda sukai',
                    home:'Beranda', shop:'Toko', profile:'Profil', verification:'Verifikasi', services:'Layanan',
                    leaderboard:'Papan Skor', exchange:'Tukar', redeemCode:'Tukar Kode',
                    inviteEarn:'Undang & Dapatkan', supportTeam:'Tim Dukungan',
                    support:'Tim Dukungan', appearance:'Tampilan', themeDark:'TEMA: MODE GELAP',
                    accountStatus:'Status Akun', displaySecurity:'TAMPILAN & KEAMANAN',
                    totalAssets:'Total Aset', estimatedValue:'PERKIRAAN NILAI',
                    applyVerify:'AJUKAN VERIFIKASI', earnFreeTokens:'Dapatkan Token Gratis',
                    yourReferral:'Link Referral Anda', invited:'DIUNDANG', earned:'DIPEROLEH',
                    topRefs:'TOP 10 REFERRAL', globalRanking:'Peringkat Global', needHelp:'Butuh Bantuan?',
                    msgSupport:'HUBUNGI DUKUNGAN', availableItems:'ITEM TERSEDIA',
                    claimReward:'KLAIM HADIAH', dailyBonus:'Bonus Harian', nextClaim:'KLAIM BERIKUTNYA:',
                    missionCenter:'PUSAT MISI', howToEarn:'CARA MENDAPATKAN',
                    yourInboxEmpty:'Kotak masuk kosong', waitingEmails:'Menunggu email masuk',
                    close:'TUTUP', copyAll:'SALIN SEMUA',
                },
            };

            // ─── State ────────────────────────────────────────────────────────────────
            let currentLang = localStorage.getItem('appLanguage') || 'en';

            // ─── Apply Translations ───────────────────────────────────────────────────
            function applyTranslations(code) {
                const t = TRANSLATIONS[code] || TRANSLATIONS['en'];
                const lang = LANGUAGES.find(l => l.code === code) || LANGUAGES[0];

                // RTL support
                document.documentElement.dir = lang.dir;
                document.documentElement.lang = code;

                // 1) All data-i18n tagged elements across entire app
                document.querySelectorAll('[data-i18n]').forEach(el => {
                    const key = el.getAttribute('data-i18n');
                    if (t[key] !== undefined) {
                        // Check if element has icons (i tags, images, or other inline elements)
                        const hasIcons = el.querySelector('i, svg, img, .icon') !== null || 
                                        el.innerHTML.includes('<i ') || 
                                        el.innerHTML.includes('<svg') ||
                                        el.innerHTML.includes('<img');
                        
                        if (hasIcons) {
                            // Preserve icons - only update text content
                            // Get the HTML and replace only text portions
                            let html = el.innerHTML;
                            // Find text content between tags
                            const textMatch = html.match(/>([^<]+)</g);
                            if (textMatch) {
                                // Replace text while keeping tags
                                html = html.replace(/>([^<]+)</g, '> ' + t[key] + '< ');
                                el.innerHTML = html;
                            } else {
                                // Fallback if no text nodes found between tags
                                el.textContent = t[key];
                            }
                        } else {
                            // No icons, safe to replace textContent
                            el.textContent = t[key];
                        }
                    }
                });

                // Update HTML lang attribute
                document.documentElement.lang = code;
                
                // Update direction for RTL languages
                const langInfo = LANGUAGES.find(l => l.code === code);
                if (langInfo) {
                    document.documentElement.dir = langInfo.dir || 'ltr';
                }

                // Re-apply after delay for dynamic content
                setTimeout(() => {
                    document.querySelectorAll('[data-i18n]').forEach(el => {
                        const key = el.getAttribute('data-i18n');
                        if (t[key] !== undefined) {
                            const hasIcons = el.querySelector('i, svg, img, .icon') !== null || 
                                            el.innerHTML.includes('<i ') || 
                                            el.innerHTML.includes('<svg') ||
                                            el.innerHTML.includes('<img');
                            

                            if (hasIcons) {
                                let html = el.innerHTML;
                                const textMatch = html.match(/>([^<]+)</g);
                                if (textMatch) {
                                    html = html.replace(/>([^<]+)</g, '> ' + t[key] + '< ');
                                    el.innerHTML = html;
                                }
                            } else {
                                el.textContent = t[key];
                            }
                        }
                    });
                }, 600);
            }

            // ─── Open / Close Modal ───────────────────────────────────────────────────
            function openLanguageModal() {
                renderLangList();
                const modal = document.getElementById('languageModal');
                const sheet = document.getElementById('langSheet');
                modal.classList.add('open');
                modal.style.display = 'flex';
                setTimeout(() => { sheet.style.transform = 'translateY(0)'; }, 20);
            }

            function closeLanguageModal() {
                const modal = document.getElementById('languageModal');
                const sheet = document.getElementById('langSheet');
                sheet.style.transform = 'translateY(100%)';
                setTimeout(() => {
                    modal.style.display = 'none';
                    modal.classList.remove('open');
                }, 380);
            }

            // ─── Render Language List ─────────────────────────────────────────────────
            function renderLangList() {
                const container = document.getElementById('langList');
                if (!container) return;
                container.innerHTML = '';
                LANGUAGES.forEach(lang => {
                    const isSelected = lang.code === currentLang;
                    const div = document.createElement('div');
                    div.className = 'lang-option' + (isSelected ? ' selected' : '');
                    div.onclick = () => selectLanguage(lang.code);
                    div.innerHTML = '<div class="lang-flag">' + lang.flag + '</div>' +
                        '<div class="lang-info">' +
                            '<div class="lang-name">' + lang.name + '</div>' +
                            '<div class="lang-native">' + lang.native + '</div>' +
                        '</div>' +
                        '<i class="fas fa-check-circle lang-check"></i>';
                    container.appendChild(div);
                });
            }

            // ─── Select Language ──────────────────────────────────────────────────────
            function selectLanguage(code) {
                currentLang = code;
                localStorage.setItem('appLanguage', code);

                // Update check UI
                document.querySelectorAll('.lang-option').forEach(el => el.classList.remove('selected'));
                const idx = LANGUAGES.findIndex(l => l.code === code);
                const opts = document.querySelectorAll('.lang-option');
                if (opts[idx]) opts[idx].classList.add('selected');

                // Apply
                applyTranslations(code);

                // Close modal
                setTimeout(() => closeLanguageModal(), 600);

                // Toast
                const lang = LANGUAGES.find(l => l.code === code);
                if (lang && typeof showToast === 'function') {
                    showToast(lang.flag + ' ' + lang.name + ' applied!', 'success');
                }
            }

            // ─── Initialize on load ───────────────────────────────────────────────────
            document.addEventListener('DOMContentLoaded', () => applyTranslations(currentLang));
            setTimeout(() => applyTranslations(currentLang), 500);
        </script>`;

html = before + newScript + after;
fs.writeFileSync('index.html', html, 'utf8');
console.log('Done! New file size:', html.length, 'chars');
console.log('New line count:', html.split('\n').length);
