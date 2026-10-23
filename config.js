// إعدادات التطبيق. Client ID ليس سرًا (يظهر في أي تطبيق ويب)، ولا تضع هنا Client Secret أبدًا.
window.HSE_CONFIG = {
  CLIENT_ID: '909925182546-asrs3oig3ga5a37t4tdqhgbl9g3vnm51.apps.googleusercontent.com',
  DATA_SHEET_ID: '1Ge9q4PP4lHZUiZaoNWujZ7pg2QSY1dkWBEeFvrSJhnI',
  DATA_TAB: 'Sheet1',
  DIR_SHEET_ID: '1uuRyYyJNHz15btgYGIRiG7tH2BsYkxLaJACLbMqXitw',
  DIR_TAB: 'OBHD',
  TZ_OFFSET_MIN: 180,
  // قراءة فقط. التطبيق لا يكتب في أي شيت.
  SCOPES: 'https://www.googleapis.com/auth/spreadsheets.readonly https://www.googleapis.com/auth/drive.readonly'
};
