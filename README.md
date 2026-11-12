# QM Chấm phiếu

PWA mobile-first cho mẫu QM 2025 - CV 1239. App không có backend, tài khoản hay đồng bộ: đề, danh sách, ảnh phiếu và điểm lưu trong IndexedDB trên thiết bị mở app.

## Dùng trên iPhone

1. Mở URL HTTPS bằng Safari.
2. Chọn **Chia sẻ → Thêm vào Màn hình chính**.
3. Tạo đề và điểm; nhập roster CSV/XLSX nếu có.
4. Mở đợt theo lớp, chọn **Quét tự động bằng camera**; giữ trọn trang 1 trong khung đến khi điểm hiện.
5. Thêm trang 2 nếu cần lưu ảnh tự luận, rà cảnh báo, rồi lưu bài.
6. Rà ảnh gốc và chọn **Chốt điểm** trước khi xuất CSV.

## Tính năng

- Scan OMR tại chỗ: SBD 8 chữ số, mã đề 4 chữ số, 40 câu A–D, 32 ý Đúng/Sai, 6 câu số.
- Quét camera trực tiếp trên iPhone: tự nhận phiếu ổn định, đọc SBD/mã đề và hiện điểm trước khi lưu.
- Báo ô mờ, ô bỏ trống, tô nhiều, thiếu trang, SBD không khớp, SBD trùng, mã đề lệch.
- Sửa đáp án/SBD/mã đề; lưu đáp án nhận dạng ban đầu, đáp án sửa, điểm và hai ảnh gốc.
- Chấm Phần II theo từng ý hoặc trọn câu; điểm riêng từng câu; so số thập phân chính xác, gồm số âm.
- Nhập roster CSV/XLSX; trích xuất mã đề có nhãn “Mã đề” cùng đáp án từ XLSX/DOCX/PDF có text; xuất CSV UTF-8 mở được bằng Excel.
- Cache app cho lần mở offline tiếp theo. Dùng PDF QM 2025 bạn đang có để in phiếu.
- Giao diện tối theo cài đặt thiết bị; nút trên cùng đổi sáng/tối và nhớ lựa chọn.

## Giới hạn

- Chỉ tích hợp form QM 2025. Ảnh giấy nghiêng, lệch khung hoặc in sai tỉ lệ có thể làm OMR bỏ sót; rà từng cảnh báo và thử phiếu giấy thật trước khi tin điểm.
- Scanner dùng bốn mốc để căn ảnh song tuyến tính; không sửa méo phối cảnh mạnh hoặc bù ảnh chụp quá xa. Khung camera cần thấy trọn trang.
- PDF scan không có text không OCR được trên Safari; nhập đáp án tay. DOC/PDF bảo vệ bằng mật khẩu và XLS cũ chưa hỗ trợ.
- Trang tự luận lưu làm ảnh, không OCR hoặc chấm.
- Chỉ một thiết bị có bản dữ liệu. Dữ liệu Safari có thể mất nếu xóa dữ liệu trang web hoặc bộ nhớ thiết bị bị thu hồi; xuất CSV thường xuyên để giữ bảng điểm.
- PWA repo public không phát tán PDF kỳ thi đính kèm; chỉ chứa mã app và thư viện được cấp phép.

## Kiểm tra cục bộ

```sh
node tests/self-check.mjs
node --check app.mjs
node --check imports.mjs
```

Self-check dựng form tổng hợp 78 mục, gồm SBD/mã đề, số âm-thập phân, skew nhẹ, tô mờ và thiếu trang. Chưa hiệu chỉnh bằng phiếu thật.

## Thư viện đi kèm

- [fflate](https://github.com/101arrowz/fflate), MIT.
- [PDF.js](https://github.com/mozilla/pdf.js), Apache-2.0.

Thông báo giấy phép nằm trong `vendor/`.
