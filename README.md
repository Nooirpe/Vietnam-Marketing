# Vietnam Market Intelligence & Customer Needs/Wants System

Ứng dụng bản đồ số để tìm kiếm, so sánh và đánh giá địa bàn kinh doanh tại Việt Nam. Bản demo có bản đồ đa lớp, bộ lọc, hồ sơ địa bàn, biểu đồ so sánh và chấm điểm Min–Max có thể xuất CSV/JSON.

**Công nghệ** React, TypeScript, Vite, Tailwind CSS, Leaflet và Chart.js. Ứng dụng đọc JSON/GeoJSON tĩnh từ `public/data/` nên có thể chạy ngay với dữ liệu mẫu, không cần API, cơ sở dữ liệu, tệp môi trường hoặc khóa dịch vụ bản đồ.

## Chạy dự án

Chuẩn bị **Node.js 24** kèm npm. Môi trường đã kiểm tra dùng Node.js 24.20.0 và npm 11.19.0. Nếu định đưa mã lên GitHub, cài thêm Git và đăng nhập khi Git yêu cầu.

Mở PowerShell trong thư mục `vietnam-market-intelligence` có `package.json` rồi chạy các lệnh sau.

```powershell
node --version
npm.cmd --version
npm.cmd ci
npm.cmd run dev
```

Mở [http://localhost:5173/#/map](http://localhost:5173/#/map) hoặc dùng cổng **Local** mà Vite in ra nếu 5173 đang bận. Giữ terminal mở khi dùng. Nhấn `Ctrl+C` để dừng. Trên macOS/Linux, chạy `npm` và `npx` thay cho `npm.cmd` và `npx.cmd`.

### Kiểm thử và xem bản build

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npx.cmd playwright install chromium
npm.cmd run test:e2e
npm.cmd run build
npm.cmd run preview
```

Chạy lệnh cài Chromium lần đầu nếu máy chưa có trình duyệt phù hợp. Bộ kiểm thử E2E cũng hỗ trợ Chrome đã cài trên Windows. Vite tạo bản build trong `dist/`. Mở địa chỉ **Local** do lệnh preview in ra, mặc định là [http://localhost:4173/#/map](http://localhost:4173/#/map), để kiểm tra bản build.

`npm test` chạy kiểm thử domain và component; `npm run test:e2e` chạy luồng trình duyệt Chromium, gồm kiểm tra axe trên bản đồ, hồ sơ, so sánh và chấm điểm. Hai workflow trong `.github/workflows/` chạy CI và triển khai GitHub Pages từ nhánh `main`.

### Cấu trúc dự án

| Thư mục | Nội dung |
|---|---|
| `src/pages/` và `src/components/` | Màn hình, bản đồ, tìm kiếm, biểu đồ và chấm điểm |
| `src/data/` và `src/domain/` | Đọc và kiểm tra dữ liệu, giải quyết chỉ tiêu, lọc và tính điểm |
| `public/data/` | Bộ mẫu sơ đồ và bộ ranh giới mặc định |
| `tests/` | Kiểm thử logic và luồng trình duyệt |
| `scripts/` | Dựng lại bộ ranh giới từ nguồn |

## Dữ liệu

- `public/data/v1-boundaries/` là bộ mặc định, hiển thị 34 tỉnh/thành theo mốc hành chính 01/07/2025. Có ranh giới cho ba phường Ba Đình, Hoàn Kiếm và Sài Gòn. Phạm vi tra cứu cấp xã hiện gồm ba phường này. Các chỉ tiêu thị trường và khảo sát là mô phỏng, chỉ có ở hai thành phố và ba phường mẫu.
- `public/data/v1/` giữ nguyên bộ mẫu sơ đồ từ Mục 2. Chọn **Sơ đồ mẫu** trong mục **Hình học** hoặc mở `/#/map?snapshot=demo`. Cả hai bộ dùng cùng hợp đồng v1. Tệp ranh giới phường của bộ mặc định chỉ được tải khi vào tỉnh/thành tương ứng.

### Nạp dữ liệu thị trường và khảo sát

Chuẩn bị `market.csv` và `survey.csv` theo đúng danh mục trong `geo_units.json`, `indicators.json` và nguồn đã khai báo ở `manifest.json`. Mở CSV bằng trình soạn thảo văn bản hoặc đặt cột `adminCode` thành kiểu **Text** trong bảng tính để giữ số 0 đầu. Mã phải khớp chính xác với `geo_units.json.code`; không chuyển mã sang số.

- `market.csv`: cột bắt buộc `adminCode,period,indicator,value,sourceId,status`; cột `reason` tùy chọn. Mỗi dòng là một chỉ tiêu thị trường. `period` có dạng `YYYY-Q1` đến `YYYY-Q4`; `indicator` phải là mã có `kind: "market"`. `value` là số không âm dùng dấu chấm thập phân. Giá trị trống chỉ hợp lệ với `status=unavailable`; có thể điền `reason`.
- `survey.csv`: cột bắt buộc `adminCode,period,indicator,value,low,high,sourceId,status,n,method,segment,study`; `reason` tùy chọn. Mỗi nhóm `(adminCode,period,segment,study)` có đủ bốn dòng `unmet`, `online`, `offline`, `wtp`. Ba tỷ lệ dùng `value` trong khoảng 0–100 và online + offline phải bằng 100% (sai số tối đa 0,1 điểm); WTP dùng `low,high`, không dùng `value`. `n` là số mẫu dương và `method` là phương pháp khảo sát. Để biểu diễn nhóm chưa có bằng chứng, nhập dòng `status=unavailable` và để `value,low,high,n,method` trống.
- `status` nhận `verified`, `estimated` hoặc `unavailable`. Không đưa số minh họa thành số liệu đã xác minh; dữ liệu ước tính phải gắn `estimated` và giữ `isDemo=true`.

Chạy lệnh sau từ thư mục dự án. Trước khi nhập, thêm thông tin nguồn thật vào `manifest.sources`; sao lưu dữ liệu nếu cần giữ bộ hiện tại. Script kiểm tra các khóa trùng, mã địa bàn, mã chỉ tiêu, kỳ đo, nguồn và trạng thái. Nếu có lỗi, script liệt kê tệp/dòng và không ghi đầu ra. Khi thành công, thay thế hai tệp quan sát/khảo sát hiện tại bằng nội dung CSV và thêm các kỳ quý còn thiếu vào manifest.

```powershell
python scripts\import_data.py market.csv survey.csv --data-dir public\data\v1-boundaries
```

`isDemo` mặc định được đặt là `true`. Chỉ khi đã kiểm tra và xác nhận **mọi nguồn được khai báo** là thật, dùng `--real-source-id ID` cho từng nguồn; các ID/nhãn mô phỏng (ví dụ `SIM-M`, `SIM-S`) luôn giữ `isDemo=true`. Không đánh dấu nguồn là thật chỉ để ẩn huy hiệu. Khi có ít nhất hai kỳ có giá trị số, popup bản đồ và hồ sơ hiển thị sparkline; kỳ thiếu dữ liệu được giữ như khoảng trống, không nội suy.

Kiểm thử script nhập CSV bằng:

```powershell
python -m unittest discover -s tests -p test_import_data.py
```

## Thử luồng phân tích

- Từ bản đồ chọn địa bàn và mở **Xem hồ sơ địa bàn**. Hồ sơ cho thấy bối cảnh thị trường, khảo sát Needs & Wants và nguồn theo kỳ.
- Mở `/#/compare?areas=W00004,W00070,W26740` để so sánh ba phường mẫu. Dùng bộ chọn chỉ tiêu để đổi biểu đồ và bấm nhãn nguồn trong bảng để đọc chi tiết.
- Mở `/#/decision?areas=P01,P79`, chọn **Tính điểm** với Min–Max v1 và trọng số mặc định 60/40. TP. Hồ Chí Minh đạt 60 điểm mô phỏng, Hà Nội đạt 40 điểm. Khi đổi trọng số sang 30/70, hai điểm tương ứng là 30 và 70. Mở từng dòng để xem phép tính và tải CSV/JSON.
- Trong **Tiện ích**, chọn Tiếng Việt/English; lựa chọn được lưu trong trình duyệt và cập nhật `lang` trên tài liệu. Định dạng số và đơn vị cũng thay đổi theo ngôn ngữ.
- Trang chấm điểm có preset ngành **Giao hàng tạp hóa**, **Cà phê / F&B** và **Dược phẩm bán lẻ**. Hai ngành mới dùng chỉ tiêu tổng quát có sẵn làm proxy và được ghi rõ trong giao diện; chúng không bổ sung hoặc giả lập số liệu chuyên ngành.
- Chọn Min–Max v2 để chuẩn hóa theo tập ứng viên hoặc toàn bộ địa bàn cùng cấp. Có thể dùng tối đa sáu tiêu chí scalar, áp dụng preset trọng số, thêm ràng buộc cứng bằng ngưỡng tối thiểu/tối đa và xem phân tích độ nhạy ±10 điểm. Phiên bản thuật toán, phạm vi chuẩn hóa và ngành được ghi vào báo cáo. Khi nhập CSV thành bảng, đặt cột `adminCode` ở kiểu văn bản để giữ số 0 đầu.

## Đưa mã nguồn lên GitHub

1. Tạo một repository trống trên GitHub, ví dụ `vietnam-market-intelligence`. Chọn **Public** khi đã rà soát nội dung. Bỏ chọn các mục tạo sẵn README, `.gitignore` và license để lần push đầu khớp lịch sử local.
2. Mở terminal trong **thư mục dự án có `package.json`**, rồi chạy các lệnh sau. Thay `YOUR_USERNAME` và tên repo nếu khác với ví dụ. Sau `git add .`, xem danh sách đang chờ commit rồi mới chạy các lệnh tiếp theo.

```powershell
git init -b main
git add .
git diff --cached --name-only
```

Giữ mã nguồn, `package-lock.json` và dữ liệu mẫu trong `public/data/`. `.gitignore` loại `node_modules/`, `dist/`, kết quả kiểm thử và các tệp môi trường. Trước khi commit, rà soát danh sách để loại thông tin cá nhân, thông tin đăng nhập, dữ liệu khảo sát gốc và tài liệu nộp riêng.

```powershell
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/vietnam-market-intelligence.git
git remote -v
git push -u origin main
```

Nếu Git báo thiếu danh tính khi commit, đặt `git config user.name "Tên của bạn"` và `git config user.email "Email GitHub của bạn"` trong repo. Bạn có thể dùng địa chỉ email `noreply` từ phần cài đặt email của GitHub. [Hướng dẫn đưa mã có sẵn lên GitHub](https://docs.github.com/en/migrations/importing-source-code/using-the-command-line-to-import-source-code/adding-locally-hosted-code-to-github?platform=windows)

Sau khi repo có trên GitHub, người khác có thể chạy bằng cách clone mã rồi cài phụ thuộc:

```powershell
git clone https://github.com/YOUR_USERNAME/vietnam-market-intelligence.git
cd vietnam-market-intelligence
npm.cmd ci
npm.cmd run dev
```

**Link demo online:** workflow `Deploy to GitHub Pages` tự build và xuất bản `dist/` khi có push lên `main` hoặc chạy thủ công. Bật Pages trong Settings → Pages, chọn GitHub Actions làm nguồn triển khai. Vite tự đặt base path theo tên repository; ứng dụng dùng `HashRouter`, nên project site có dạng `https://YOUR_USERNAME.github.io/vietnam-market-intelligence/#/map`. [Hướng dẫn triển khai Vite lên GitHub Pages](https://vite.dev/guide/static-deploy.html#github-pages)

## Nguồn và giấy phép

Mã nguồn hiện chưa có tệp `LICENSE`. Nếu nhóm muốn cấp quyền sử dụng lại mã, thống nhất giấy phép và thêm `LICENSE` cho phần mã của nhóm. Các lớp dữ liệu địa giới giữ giấy phép của nguồn tương ứng. [Hướng dẫn giấy phép repository](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository)

Đối chiếu 34 mã tỉnh và ba mã phường với danh mục hành chính mốc 01/07/2025. [Quyết định 19/2025/QĐ-TTg](https://vanban.chinhphu.vn/?classid=1&docid=214409&pageid=27160&typegroupid=5)

- Tỉnh lấy từ `vnm_admin1.geojson` thuộc COD-AB v02 của OCHA ROAP/HDX, nguồn Tổng cục Thống kê, được rà soát ngày 25/09/2025. Giấy phép CC BY 3.0 IGO. Giản lược theo đường biên chung tại dung sai 0,0013° và sửa polygon không hợp lệ của An Giang. Kiểm tra hợp lệ sau xử lý, giữ các cấu phần polygon theo nguồn. [Nguồn COD-AB](https://data.humdata.org/dataset/cod-ab-vnm) · [Giấy phép](https://creativecommons.org/licenses/by/3.0/igo/)
- Ba phường lấy từ © OpenStreetMap contributors, giấy phép ODbL 1.0. Dựng polygon từ các đường outer/inner của quan hệ OSM và kiểm tra chúng thuộc tỉnh/thành cha. Đây là ranh giới tham chiếu từ dữ liệu cộng đồng. [Ba Đình](https://www.openstreetmap.org/relation/19331652) · [Hoàn Kiếm](https://www.openstreetmap.org/relation/19331651) · [Sài Gòn](https://www.openstreetmap.org/relation/19260504) · [Giấy phép ODbL](https://www.openstreetmap.org/copyright)

### Dựng lại dữ liệu ranh giới

Phần này dành cho người bảo trì dữ liệu. Chạy demo dùng các tệp GeoJSON đã đóng gói. Script `scripts/build_boundaries.py` cần Python với Shapely 2.1, tệp GeoJSON ZIP từ HDX (`cod-vnm.zip`), và phản hồi JSON từ Overpass (`osm-2025.json`). `scripts/ward_relations.csv` ánh xạ `relationId` OSM sang `geoId` phường trong `geo_units.json`.

```text
[out:json][timeout:20][date:"2025-09-25T00:00:00Z"];rel(id:19260504,19331651,19331652);out geom;
```

| Tệp | SHA-256 |
|---|---|
| `cod-vnm.zip` | `0a74e8ee18eb84b21f980fa4bd2a3135d2bc42fbd6e31450472368ff48abe41b` |
| `osm-2025.json` | `59885ba3d27894d76ffe0b13b817307cdae35781b3253406b86aa772608d1359` |

Để thêm phường ở tỉnh khác, chỉ thêm địa bàn đã có nguồn kiểm chứng vào `public/data/v1-boundaries/geo_units.json`, thêm ánh xạ `relationId,geoId` vào `scripts/ward_relations.csv`, rồi tải quan hệ OSM tương ứng vào phản hồi Overpass. Mã đơn vị phải là mã phường 5 chữ số, `parentId` phải là mã tỉnh trong danh mục. Không suy diễn hình học hoặc mã hành chính. Chạy `python scripts/build_boundaries.py cod-vnm.zip osm-2025.json`; script kiểm tra đủ quan hệ, tên phường và vị trí thuộc tỉnh, tạo `wards/Pxx.geojson` cho mỗi tỉnh có phường, rồi cập nhật `wardsByProvince`. Khi thư mục đích đã tồn tại, script giữ nguyên các tệp chỉ tiêu và khảo sát đã nạp. SHA-256 của phản hồi Overpass cũng phụ thuộc metadata của máy chủ.
