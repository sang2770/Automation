# Automation Tool - Electron Multi-Threading

Ứng dụng Electron cho phép chạy automation Playwright với nhiều luồng worker song song.

## Tính năng

- 🚀 **Multi-Threading**: Chạy nhiều worker song song
- 📧 **Google Account Automation**: Tự động hóa với tài khoản Google
- 📊 **Google Sheets Integration**: Tích hợp với Google Sheets và Apps Script
- 🔐 **2FA Support**: Hỗ trợ xác thực 2 bước
- 📁 **File Import**: Import tài khoản và dữ liệu từ file
- 📈 **Real-time Monitoring**: Theo dõi tiến trình real-time
- 🎨 **Modern UI**: Giao diện đẹp và dễ sử dụng

## Cài đặt

### Phương pháp 1: Chạy trực tiếp
1. Chạy file `run-electron.bat`
2. Ứng dụng sẽ tự động cài đặt dependencies và khởi chạy

### Phương pháp 2: Build thành file exe
1. Chạy file `build-electron.bat`
2. Tìm file .exe trong thư mục `dist`

### Phương pháp 3: Manual
```bash
# Copy package.json
copy electron-package.json package.json

# Install dependencies
npm install

# Run application
npm start

# Or build
npm run build
```

## Cách sử dụng

### 1. Chuẩn bị dữ liệu

#### Phương pháp 1: Separated Format (Tách riêng accounts và data)
- **Google Accounts**: Format: `email|password|secretKey` (mỗi tài khoản một dòng)
```
email1@gmail.com|password1|secret1
email2@gmail.com|password2|secret2
```
- **Shared Data**: Tất cả accounts sử dụng chung pool data cho columns A, B, C, D
- **Ưu điểm**: Dễ quản lý khi có nhiều data và muốn random
- **Nhược điểm**: Không thể custom data riêng cho từng account

#### Phương pháp 2: Combined Format (Mỗi account có data riêng)
Format: `email|password|secretKey|dataA|dataB|dataC|dataD` (mỗi account một dòng)
```
email1@gmail.com|password1|secret1|data1A|data1B|data1C|data1D
email2@gmail.com|password2|secret2|data2A|data2B|data2C|data2D
```
- **Ưu điểm**: Mỗi account có data hoàn toàn riêng biệt
- **Nhược điểm**: Phải chuẩn bị data cho từng account

### 2. Configuration

1. **Chọn Input Format**: 
   - "Separated Input": Accounts và data tách riêng
   - "Combined Input": Mỗi account có data riêng

2. **Import Data**:
   - **Separated**: Import accounts file riêng và data file riêng
   - **Combined**: Import một file duy nhất chứa cả accounts và data

3. **Set Workers**: Chọn số worker song song (khuyến nghị 2-5)
4. **Custom Function**: (Tùy chọn) Nhập custom fillDataFuncString

### 3. Chạy Automation

1. Nhấn "Start Automation"
2. Theo dõi tiến trình qua Status panel
3. Xem logs chi tiết
4. Có thể dừng bất kỳ lúc nào với "Stop All Workers"

## Kiến trúc

```
src/
├── main.js              # Main Electron process
├── preload.js           # Preload script (security)
├── worker.js            # Worker process (Playwright automation)
└── renderer/
    ├── index.html       # UI
    ├── styles.css       # Styling
    └── renderer.js      # Frontend logic
```

## Worker Process

Mỗi worker sẽ:
1. Khởi tạo browser context riêng
2. Đăng nhập Google account
3. Tạo Google Sheets
4. Mở Apps Script
5. Thực thi các function:
   - Permission function
   - Fill data function
   - Send emails function
6. Monitor và re-run nếu timeout

## Yêu cầu hệ thống

- Windows 10/11
- Node.js 16+
- Google Chrome browser
- RAM: 4GB+ (cho multiple workers)
- Disk space: 200MB+

## Lưu ý bảo mật

- Ứng dụng chạy local, không gửi dữ liệu lên server
- Mỗi worker tạo browser profile riêng
- Credentials được xử lý trong memory
- Tự động cleanup khi đóng ứng dụng

## Troubleshooting

### Lỗi Chrome executable
```javascript
// Sửa đường dẫn trong worker.js
executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
```

### Lỗi 2FA
- Kiểm tra secret key đúng định dạng
- Đảm bảo đồng hồ hệ thống chính xác

### Worker crash
- Giảm số worker concurrent
- Kiểm tra RAM available
- Restart ứng dụng

## License

MIT License

## Support

Tạo issue trên GitHub repository để được hỗ trợ.
