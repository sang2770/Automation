# WAV Mixer Pro - Device Activation Feature

Ứng dụng này bao gồm hệ thống kích hoạt thiết bị sử dụng Google Sheets để quản lý license thiết bị.

## Tính năng

- **Hiển thị Device ID**: Hiển thị mã định danh thiết bị duy nhất trong UI
- **Trạng thái kích hoạt**: Kiểm tra trạng thái kích hoạt thiết bị theo thời gian thực
- **Tích hợp Google Sheets**: Sử dụng Google Sheets để quản lý license thiết bị
- **Sao chép Device ID**: Dễ dàng sao chép Device ID để đăng ký license

## Hướng dẫn thiết lập

### 1. Thiết lập Google Sheets

1. Truy cập Google Sheets của bạn: https://docs.google.com/spreadsheets/d/1ZBWgZXISKT_dZGXlnp9ibB2PpypQepAJCppg3UEjl3k/edit
2. Đảm bảo sheet có các cột sau:
   - **Cột A**: Device ID
   - **Cột B**: Status (active/inactive)
   - **Cột C**: Expiry Date (tùy chọn, định dạng: YYYY-MM-DD)

Ví dụ:
```
Device ID                    | Status | Expiry Date
abc123def456ghi789          | active | 2026-12-31
xyz789uvw456rst123          | active | 2026-06-30
def456ghi789jkl012          | inactive | 
```

### 2. Chia sẻ Google Sheets (Quan trọng!)

1. Nhấp vào nút "Share" (Chia sẻ) trong Google Sheets
2. Thay đổi quyền truy cập thành "Anyone with the link" (Bất kỳ ai có liên kết)
3. Đặt quyền thành "Viewer" (Người xem)
4. Nhấp "Done"

### 3. Cách kích hoạt thiết bị

1. Người dùng chạy ứng dụng và sao chép Device ID của họ
2. Thêm Device ID vào Google Sheet với status "active"
3. Người dùng nhấp nút "Kiểm tra" để xác minh kích hoạt
4. Sau khi kích hoạt, người dùng có thể sử dụng tất cả tính năng của ứng dụng

## Cách hoạt động

Ứng dụng sẽ:
1. Tải dữ liệu CSV trực tiếp từ Google Sheets
2. Tìm kiếm Device ID trong danh sách
3. Kiểm tra trạng thái (active/inactive)
4. Kiểm tra ngày hết hạn (nếu có)
5. Trả về kết quả kích hoạt

## Tạo Device ID

Device ID được tạo bằng thư viện `node-machine-id`, tạo mã định danh duy nhất dựa trên:
- Thông tin phần cứng máy
- OS installation ID
- Thông tin network adapter

Điều này đảm bảo mỗi thiết bị có ID duy nhất và ổn định.

## Tính năng bảo mật

- Kiểm tra kích hoạt thiết bị trước khi cho phép xử lý âm thanh
- Xác minh trạng thái kích hoạt theo thời gian thực
- Google Sheets cung cấp audit trail của tất cả kích hoạt
- Không cần API key hay authentication phức tạp

## Khắc phục sự cố

### "Không thể kiểm tra kích hoạt"
- Kiểm tra kết nối internet
- Đảm bảo Google Sheet đã được chia sẻ public (Anyone with the link)
- Kiểm tra Sheet ID trong code có đúng không

### "Thiết bị chưa được kích hoạt"
- Sao chép Device ID từ ứng dụng
- Kiểm tra xem Device ID có tồn tại trong Google Sheet không
- Xác minh cột status được đặt thành "active"
- Kiểm tra ngày hết hạn nếu có

### Device ID không tải được
- Khởi động lại ứng dụng
- Kiểm tra package `node-machine-id` đã được cài đặt đúng

## Kiểm tra thủ công

Để kiểm tra CSV data, bạn có thể truy cập:
```
https://docs.google.com/spreadsheets/d/1ZBWgZXISKT_dZGXlnp9ibB2PpypQepAJCppg3UEjl3k/export?format=csv&gid=0
```

Điều này sẽ trả về dữ liệu CSV của sheet.
