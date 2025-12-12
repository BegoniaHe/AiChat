#!/bin/bash

# 下载依赖脚本

echo "📦 开始下载前端依赖..."

# 创建目录
mkdir -p src/lib
mkdir -p src/assets/css

# 下载 jQuery
echo "⬇️  下载 jQuery..."
curl -L -o src/lib/jquery.min.js https://code.jquery.com/jquery-3.7.1.min.js
if [ $? -eq 0 ]; then
    echo "✅ jQuery 下载完成"
else
    echo "❌ jQuery 下载失败"
fi

# 下载 Toastr
echo "⬇️  下载 Toastr..."
curl -L -o src/lib/toastr.min.js https://cdnjs.cloudflare.com/ajax/libs/toastr.js/2.1.4/toastr.min.js
curl -L -o src/assets/css/toastr.min.css https://cdnjs.cloudflare.com/ajax/libs/toastr.js/2.1.4/toastr.min.css
if [ $? -eq 0 ]; then
    echo "✅ Toastr 下载完成"
else
    echo "❌ Toastr 下载失败"
fi

# 下载外部 CSS（如果需要）
# echo "⬇️  下载外部 CSS..."
# curl -L -o src/assets/css/result.css https://static.zeoseven.com/zsft/59/main/result.css

echo ""
echo "✅ 所有依赖下载完成！"
echo ""
echo "📝 提示："
echo "   - 依赖文件已保存到 src/lib/ 和 src/assets/css/"
echo "   - 请确保在 HTML 中使用相对路径引用这些文件"
echo ""
