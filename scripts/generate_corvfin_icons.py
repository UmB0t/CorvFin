import os
import base64
from PIL import Image

def generate_icons():
    icons_dir = r"C:\Users\cabra\Downloads\CorvFin\Financas-Pro\public\icons"
    master_path = os.path.join(icons_dir, "corvfin-logo-compact.png")
    
    if not os.path.exists(master_path):
        raise FileNotFoundError(f"Master file not found: {master_path}")
        
    master = Image.open(master_path).convert("RGBA")
    w, h = master.size # 1306 x 1205
    
    # Create square canvas 1306 x 1306 with #000000 background
    square_size = max(w, h)
    square = Image.new("RGBA", (square_size, square_size), (0, 0, 0, 255))
    paste_y = (square_size - h) // 2
    paste_x = (square_size - w) // 2
    square.paste(master, (paste_x, paste_y))
    
    # Sizes to generate
    png_sizes = [
        ("icon-512x512.png", 512),
        ("icon-192x192.png", 192),
        ("apple-touch-icon.png", 180),
        ("apple-touch-icon-180x180.png", 180),
        ("apple-touch-icon-152x152.png", 152),
        ("apple-touch-icon-120x120.png", 120),
        ("favicon-32x32.png", 32),
        ("favicon-16x16.png", 16)
    ]
    
    for filename, size in png_sizes:
        out_path = os.path.join(icons_dir, filename)
        resized = square.resize((size, size), Image.Resampling.LANCZOS)
        resized.save(out_path, format="PNG", optimize=True)
        print(f"Generated {filename}: {size}x{size} ({os.path.getsize(out_path)} bytes)")
        
    # Generate favicon.svg wrapper embedding the 32x32 PNG to avoid vector tracing
    # 32x32 favicon.svg
    with open(os.path.join(icons_dir, "favicon-32x32.png"), "rb") as f:
        b64_32 = base64.b64encode(f.read()).decode("ascii")
        
    favicon_svg_content = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">
  <image href="data:image/png;base64,{b64_32}" width="32" height="32" />
</svg>
'''
    with open(os.path.join(icons_dir, "favicon.svg"), "w", encoding="utf-8") as f:
        f.write(favicon_svg_content)
    print("Generated favicon.svg (embedded 32x32 PNG, no vector tracing)")

if __name__ == "__main__":
    generate_icons()
