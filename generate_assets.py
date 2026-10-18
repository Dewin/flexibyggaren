import math
from PIL import Image, ImageDraw

def create_icon(size, filename):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Rounded dark-blue background
    pad = int(size * 0.04)
    radius = int(size * 0.22)
    draw.rounded_rectangle(
        [pad, pad, size - pad, size - pad],
        radius=radius,
        fill=(18, 25, 43, 255),
        outline=(59, 130, 246, 255),
        width=max(2, int(size * 0.025))
    )

    # Draw a colorful S-curve Flexi-Trax track across the icon
    colors = [
        (239, 68, 68, 255),   # Red
        (250, 204, 21, 255),  # Yellow
        (59, 130, 246, 255),  # Blue
        (34, 197, 94, 255),   # Green
    ]

    steps = 28
    track_width = size * 0.22
    rung_thickness = max(2, int(size * 0.025))

    for i in range(steps):
        t = i / (steps - 1)
        x = size * (0.18 + 0.64 * t)
        y = size * (0.76 - 0.52 * t + 0.12 * math.sin(t * math.pi * 2.0))

        # Tangent
        dt = 0.01
        x2 = size * (0.18 + 0.64 * (t + dt))
        y2 = size * (0.76 - 0.52 * (t + dt) + 0.12 * math.sin((t + dt) * math.pi * 2.0))
        dx = x2 - x
        dy = y2 - y
        length = math.hypot(dx, dy) or 1.0
        nx = -dy / length
        ny = dx / length

        col = colors[(i // 2) % len(colors)]
        x_left = x + nx * (track_width * 0.5)
        y_left = y + ny * (track_width * 0.5)
        x_right = x - nx * (track_width * 0.5)
        y_right = y - ny * (track_width * 0.5)

        # Draw track tie / rung
        draw.line([(x_left, y_left), (x_right, y_right)], fill=col, width=rung_thickness * 2)
        # Side rails
        r_rad = max(2, int(size * 0.022))
        draw.ellipse([x_left - r_rad, y_left - r_rad, x_left + r_rad, y_left + r_rad], fill=col)
        draw.ellipse([x_right - r_rad, y_right - r_rad, x_right + r_rad, y_right + r_rad], fill=col)

    # Draw a cute toy off-road car in the center-top
    cx, cy = int(size * 0.52), int(size * 0.36)
    cw, ch = int(size * 0.30), int(size * 0.18)
    # Shadow
    draw.rounded_rectangle(
        [cx - cw // 2 + 4, cy - ch // 2 + 6, cx + cw // 2 + 4, cy + ch // 2 + 6],
        radius=int(size * 0.04),
        fill=(0, 0, 0, 120)
    )
    # Car body
    draw.rounded_rectangle(
        [cx - cw // 2, cy - ch // 2, cx + cw // 2, cy + ch // 2],
        radius=int(size * 0.045),
        fill=(249, 115, 22, 255),
        outline=(255, 255, 255, 255),
        width=max(2, int(size * 0.015))
    )
    # Windshield
    draw.rounded_rectangle(
        [cx - cw // 4, cy - ch // 3, cx + cw // 3, cy + ch // 3],
        radius=int(size * 0.02),
        fill=(186, 230, 253, 255)
    )

    img.save(filename, "PNG")


if __name__ == "__main__":
    create_icon(192, "icon-192.png")
    create_icon(512, "icon-512.png")
    print("Generated icon-192.png and icon-512.png")
