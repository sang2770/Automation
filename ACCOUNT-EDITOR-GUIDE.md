# 🎯 Account Editor - Hướng dẫn sử dụng

## Tính năng mới: Chọn account để import data

Trong chế độ **Combined Format**, bạn có thể:

### 📝 1. Quản lý Accounts
- **➕ Add New Account**: Thêm account trống mới
- **🔍 Select Account**: Chọn account từ dropdown để edit
- **🗑️ Delete Account**: Xóa account đã chọn
- **💾 Save**: Lưu thay đổi
- **❌ Cancel**: Hủy thay đổi

### 📁 2. Import Data riêng cho từng Account
1. Chọn **"Combined Input"** format
2. Add account mới hoặc chọn account có sẵn
3. Nhấn **"Import Data for This Account"**
4. Chọn file CSV với format: `dataA,dataB,dataC,dataD`
5. Data sẽ được load vào form của account đã chọn
6. Nhấn **"Save Account Data"** để lưu

### 📋 3. Workflow hoàn chỉnh

#### A. Thêm account mới:
```
1. Chọn "Combined Input" format
2. Nhấn "➕ Add New Account" 
3. Account Editor sẽ hiện với form trống
4. Điền thông tin: Email, Password, Secret Key
5. Import data CSV hoặc nhập thủ công cho columns A,B,C,D
6. Nhấn "💾 Save Account Data"
```

#### B. Edit account có sẵn:
```
1. Import file combined hoặc nhập manual
2. Account Editor sẽ hiện với dropdown accounts
3. Chọn account cần edit
4. Form sẽ load data của account đó
5. Edit thông tin cần thiết
6. Import data mới nếu cần
7. Nhấn "💾 Save Account Data"
```

### 📄 File Examples

**Individual account data (CSV):**
```csv
nattaponglum@gmail.com,บริษัท ABC Ltd,เรียน [Name] ยินดีด้วย,คลิกที่นี่เพื่อรับ
```

**Combined format:**
```
account1@gmail.com|pass1|secret1|dataA1|dataB1|dataC1|dataD1
account2@gmail.com|pass2|secret2|dataA2|dataB2|dataC2|dataD2
```

### 🎯 Use Cases

1. **Marketing Campaign**: Mỗi account gửi email với data khác nhau
2. **A/B Testing**: Test các message variants khác nhau
3. **Personalization**: Customize hoàn toàn data cho từng account
4. **Quality Control**: Kiểm tra và edit data từng account riêng biệt

### 🔧 Advanced Tips

- **Validation**: Form sẽ validate email, password, secret key required
- **Auto-sync**: Thay đổi sẽ tự động update vào combined textarea
- **Safe Delete**: Confirm dialog trước khi delete account
- **Import Flexibility**: Có thể import data từ CSV cho từng account riêng

### 🚀 Ready to Use!

Tính năng Account Editor giúp bạn quản lý account-specific data một cách dễ dàng và chính xác hơn!
