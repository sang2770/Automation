# 🚀 Automation Tool - Multi-Threading với Account-Specific Data

## ✨ Tính năng mới: Mỗi Account có Data riêng

Ứng dụng đã được nâng cấp để hỗ trợ 2 chế độ input:

### 🔄 1. Separated Format (Tách riêng)
- **Accounts**: Danh sách tài khoản Google
- **Data**: Pool chung data cho tất cả accounts
- **Sử dụng khi**: Muốn random data từ pool chung

### 🎯 2. Combined Format (Mỗi account có data riêng) 
- **Format**: `email|password|secret|dataA|dataB|dataC|dataD`
- **Account Editor**: Chọn account để edit data riêng biệt
- **Features**:
  - ➕ Add new account
  - 📝 Edit account credentials & data
  - 📁 Import data cho từng account riêng
  - 🗑️ Delete account
  - 💾 Save/Cancel changes
- **Ưu điểm**: Mỗi account có data hoàn toàn riêng biệt
- **Sử dụng khi**: Cần control chính xác data cho từng account

## 📁 File Examples

### Combined Format
```
account1@gmail.com|pass1|secret1|data1A|data1B|data1C|data1D
account2@gmail.com|pass2|secret2|data2A|data2B|data2C|data2D
```

### Separated Format
**Accounts file:**
```
account1@gmail.com|pass1|secret1
account2@gmail.com|pass2|secret2
```

**Data CSV file:**
```
dataA1,dataB1,dataC1,dataD1
dataA2,dataB2,dataC2,dataD2
```

## 🎮 Cách sử dụng

1. **Khởi chạy**: Chạy `run-electron.bat` hoặc `npm start`
2. **Chọn Format**: Radio button để chọn Separated hoặc Combined
3. **Import Data**: 
   - **Combined**: 
     - Import file combined hoặc
     - Add account manually và import data riêng cho từng account
     - Edit data của từng account thông qua Account Editor
   - **Separated**: Import 2 file riêng biệt
4. **Account Management** (Combined mode):
   - Chọn account từ dropdown
   - Edit credentials và data
   - Import data CSV cho account đó
   - Save/Delete account
5. **Configure Workers**: Đặt số luồng parallel (2-5 workers)
6. **Start Automation**: Nhấn Start để chạy

## 🔧 Worker Process Flow

Mỗi worker sẽ:
1. **Account Processing**: Xử lý từng account riêng biệt
2. **Data Injection**: 
   - Combined: Sử dụng data riêng của account
   - Separated: Random data từ pool chung
3. **Google Automation**: 
   - Login với Playwright
   - Tạo Google Sheets
   - Execute Apps Script functions
   - Monitor và auto-retry

## 📊 Monitoring

- **Real-time Logs**: Theo dõi tiến trình từng worker
- **Status Dashboard**: Trạng thái workers và accounts
- **Error Handling**: Auto-retry và error logging

## 🛠️ Technical Architecture

```
src/
├── main.js              # Electron main process (IPC, workers management)
├── preload.js           # Security context bridge
├── worker.js            # Playwright automation logic  
└── renderer/
    ├── index.html       # UI với dual input modes
    ├── styles.css       # Modern responsive styling
    └── renderer.js      # Frontend logic cho account-specific data
```

## ⚡ Performance

- **Multi-threading**: Parallel processing với child_process.fork()
- **Resource Management**: Mỗi worker có browser context riêng
- **Memory Optimization**: Auto-cleanup và graceful shutdown
- **Scalability**: Có thể chạy 2-10 workers đồng thời

## 🔒 Security

- **Local Processing**: Không gửi data lên server
- **Isolated Contexts**: Mỗi worker độc lập
- **Credential Protection**: Xử lý trong memory
- **Browser Profiles**: Riêng biệt cho từng worker

## 🚀 Ready to Use!

Ứng dụng đã sẵn sàng cho production với đầy đủ tính năng:
- ✅ Account-specific data support
- ✅ Multi-threading workers  
- ✅ Real-time monitoring
- ✅ Error handling & retry
- ✅ Modern responsive UI
- ✅ File import/export
- ✅ Graceful shutdown

Chạy `npm start` để bắt đầu sử dụng!
