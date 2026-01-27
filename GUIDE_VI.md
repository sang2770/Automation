# YouTube Automation Tool - Hướng Dẫn Sử Dụng

## 📋 Tổng Quan

Ứng dụng tự động hóa xem video YouTube với hỗ trợ proxy GPM, cho phép tăng lượt xem video một cách tự động và an toàn.

## 🚀 Cài Đặt & Khởi Chạy

### Yêu Cầu Hệ Thống

- **GPMLogin**: Phải chạy trên cổng 19995
- **Node.js**: Phiên bản 16 trở lên
- **Chrome/Chromium**: Để chạy automation

### Các Bước Cài Đặt

1. Giải nén hoặc clone dự án
2. Mở terminal tại thư mục dự án
3. Chạy lệnh: `npm install`
4. Khởi động: `npm start` hoặc `./start.sh`

## ⚙️ Cấu Hình

### 1. Links & Keywords (Danh Sách Link)

- **URL**: Link video YouTube cần tăng view
- **Views**: Số lượt xem muốn tăng
- **Keywords**: Từ khóa tìm kiếm (cho Method 1)
- **Enabled**: Bật/tắt link cụ thể

**Ví dụ:**

```
URL: https://www.youtube.com/watch?v=abc123
Views: 10
Keywords: học lập trình, tutorial javascript
```

### 2. GPM Profiles

- Chọn các profile GPM để sử dụng
- Mỗi worker sẽ dùng một profile khác nhau
- Đảm bảo các profile đã được cấu hình trong GPMLogin

### 3. Settings (Cài Đặt)

- **Max Threads**: Số luồng chạy đồng thời (1-10)
- **Delay Between Actions**: Thời gian chờ giữa các hành động (ms)
- **Wait for Ads**: Chờ phát hiện quảng cáo
- **Click Ads**: Tự động click quảng cáo
- **Random Method**: Random giữa 2 phương pháp

## 🎯 Phương Pháp Automation

### Method 1: Tìm Kiếm Từ Khóa

1. Vào YouTube.com
2. Nhập từ khóa ngẫu nhiên từ danh sách
3. Click video đầu tiên trong kết quả tìm kiếm
4. Chuyển đến video liên quan
5. Thay thế bằng link video đích
6. Click vào video đích
7. Chờ và xử lý quảng cáo

### Method 2: Truy Cập Trực Tiếp

1. Vào YouTube.com
2. Thay thế link video đầu tiên bằng link đích
3. Click vào video đích
4. Chờ và xử lý quảng cáo

## 🔧 Hướng Dẫn Chi Tiết

### Bước 1: Khởi Động GPMLogin

1. Mở ứng dụng GPMLogin
2. Đảm bảo chạy trên cổng 19995
3. Tạo và cấu hình ít nhất 1 profile

### Bước 2: Cấu Hình Links

1. Click nút "+" để thêm link mới
2. Nhập URL video YouTube
3. Đặt số lượt view mong muốn
4. Thêm từ khóa (cách nhau bằng dấu phẩy)
5. Bật/tắt link theo nhu cầu

### Bước 3: Chọn Profiles

1. Click "Refresh Profiles" để load danh sách
2. Click chọn các profile muốn sử dụng
3. Profile được chọn sẽ có màu xanh

### Bước 4: Điều Chỉnh Settings

- **Max Threads**: Khuyến nghị 2-5 threads
- **Delay**: Tối thiểu 2000ms để tránh bị phát hiện
- Bật các tùy chọn xử lý quảng cáo

### Bước 5: Chạy Automation

1. Click "Save Configuration" để lưu cài đặt
2. Click "Start Automation" để bắt đầu
3. Theo dõi tiến trình trong tab "Activity Log"

## 📊 Theo Dõi Tiến Trình

### Status Dashboard

- **Total Tasks**: Tổng số nhiệm vụ
- **Completed**: Đã hoàn thành
- **Running**: Đang chạy
- **Failed**: Thất bại

### Activity Log

- Hiển thị chi tiết hoạt động real-time
- Các loại log: Info, Success, Warning, Error
- Timestamp cho mỗi sự kiện

## 🛡️ Tính Năng An Toàn

### Human-like Behavior

- Delay ngẫu nhiên giữa các hành động
- Gõ phím mô phỏng con người
- Random giữa 2 phương pháp automation

### Proxy Protection

- Sử dụng proxy thông qua GPM profiles
- Xoay profile tự động
- Ẩn địa chỉ IP thật

### Error Handling

- Tự động retry khi gặp lỗi
- Cleanup resources khi dừng
- Log chi tiết để debug

## 🚨 Xử Lý Sự Cố

### GPM Connection Issues

```
❌ GPMLogin is not running!
```

**Giải pháp:**

- Khởi động GPMLogin
- Kiểm tra cổng 19995
- Đảm bảo có ít nhất 1 profile

### Browser Issues

```
❌ Failed to connect to profile
```

**Giải pháp:**

- Kiểm tra Chrome/Chromium đã cài đặt
- Restart GPM profile
- Kiểm tra tài nguyên hệ thống

### Automation Errors

```
❌ Method 1 failed: Timeout waiting for element
```

**Giải pháp:**

- Kiểm tra kết nối internet
- Tăng delay time
- Thử method khác
- Kiểm tra URL video hợp lệ

## 💡 Tips & Best Practices

### Tối Ưu Hiệu Suất

- Sử dụng 2-3 threads cho máy tính thông thường
- Delay 3000-5000ms cho kết quả tốt nhất
- Không chạy quá nhiều task cùng lúc

### Tăng Tính Ẩn Danh

- Sử dụng nhiều GPM profiles khác nhau
- Bật Random Method
- Thêm đa dạng keywords
- Sử dụng proxy chất lượng cao

### Keyword Strategy

- Sử dụng từ khóa liên quan đến video
- Kết hợp từ khóa tiếng Việt và tiếng Anh
- Avoid spam keywords
- Update keywords thường xuyên

## 📈 Monitoring & Analytics

### Real-time Stats

- Theo dõi success rate
- Thời gian hoàn thành task
- Error frequency
- Resource usage

### Log Analysis

- Filter log theo type
- Export log để phân tích
- Track performance trends
- Identify optimization opportunities

## 🔒 Bảo Mật

### Data Protection

- Không lưu trữ thông tin nhạy cảm
- Config file được mã hóa
- Secure communication với GPM API

### Safe Usage

- Không abuse YouTube ToS
- Sử dụng rate limiting hợp lý
- Respect target website resources
- Monitor for detection patterns

## 📞 Hỗ Trợ

### Self-troubleshooting

1. Kiểm tra log messages
2. Verify GPM status
3. Test internet connection
4. Restart application

### Common Solutions

- Clear browser cache
- Reset GPM profiles
- Update dependencies
- Check system resources

## 🔄 Updates & Maintenance

### Regular Tasks

- Update GPM profiles
- Refresh proxy list
- Monitor success rates
- Adjust settings based on performance

### Version Updates

- Backup configuration before update
- Test new features in staging
- Review changelog
- Update dependencies

---

**⚠️ Lưu Ý:** Sử dụng tool này một cách có trách nhiệm và tuân thủ các điều khoản sử dụng của YouTube.
