"""Узнаваемые силуэты Астаны; художественные модели, а не геодезическая реконструкция."""

import argparse
import json
import math
import struct
import sys
from pathlib import Path

import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.dont_write_bytecode = True
from generate_city_kit import OUTPUT, Shape, export, material


WHITE = (0.96, 0.95, 0.89)
STONE = (0.78, 0.76, 0.68)
DARK = (0.15, 0.27, 0.32)
GOLD = (0.88, 0.64, 0.20)
PALE_GOLD = (0.98, 0.82, 0.38)
TEAL = (0.15, 0.49, 0.61)


def beam(shape, start, end, radius, color=WHITE, sides=4):
    direction = Vector(end) - Vector(start)
    rotation = Vector((0, 0, 1)).rotation_difference(direction.normalized())
    center = (Vector(start) + Vector(end)) / 2
    part = Shape()
    part.cylinder(radius, direction.length, (0, 0, 0), color, sides=sides)
    shape.mesh([tuple(rotation @ Vector(vertex) + center) for vertex in part.vertices],
               part.faces, color)


def ring(shape, radius, z, width, color, sides=32, y_scale=1, center=(0, 0)):
    vertices = []
    for r, h in ((radius - width / 2, z - width / 2),
                 (radius + width / 2, z - width / 2),
                 (radius + width / 2, z + width / 2),
                 (radius - width / 2, z + width / 2)):
        vertices.extend((center[0] + r * math.cos(i * math.tau / sides),
                         center[1] + r * math.sin(i * math.tau / sides) * y_scale, h)
                        for i in range(sides))
    faces = []
    for layer in range(4):
        for i in range(sides):
            j = (i + 1) % sides
            faces.append((layer * sides + i, layer * sides + j,
                          ((layer + 1) % 4) * sides + j, ((layer + 1) % 4) * sides + i))
    shape.mesh(vertices, faces, color)


def ellipse(shape, rx, ry, height, z, color, sides=32):
    part = Shape()
    part.cylinder(rx, height, (0, 0, z), color, sides=sides)
    shape.mesh([(x, y * ry / rx, h) for x, y, h in part.vertices], part.faces, color)


def sphere_point(center, radius, longitude, latitude):
    return (center[0] + radius * math.cos(latitude) * math.cos(longitude),
            center[1] + radius * math.cos(latitude) * math.sin(longitude),
            center[2] + radius * math.sin(latitude))


def globe(shape, center, radius, palette, sectors=24, rows=12):
    for row in range(rows):
        low, high = -math.pi / 2 + math.pi * row / rows, -math.pi / 2 + math.pi * (row + 1) / rows
        for sector in range(sectors):
            left, right = math.tau * sector / sectors, math.tau * (sector + 1) / sectors
            vertices = [sphere_point(center, radius, left, low), sphere_point(center, radius, right, low),
                        sphere_point(center, radius, right, high), sphere_point(center, radius, left, high)]
            face = (0, 2, 3) if row == 0 else ((0, 1, 2) if row == rows - 1 else (0, 1, 2, 3))
            # Чередование оттенков заменяет текстуру и остаётся одинаковым при каждой сборке.
            color = palette[(sector * 7 + row * 3 + (sector // 4)) % len(palette)]
            shape.mesh(vertices, [face], color)


def baiterek():
    shape = Shape()
    shape.cylinder(1.40, 0.10, (0, 0, 0.05), STONE, sides=32)
    shape.cylinder(1.21, 0.11, (0, 0, 0.155), WHITE, sides=32)
    shape.cylinder(0.92, 0.12, (0, 0, 0.27), STONE, sides=24)
    shape.cylinder(0.56, 0.28, (0, 0, 0.45), WHITE, sides=16, top=0.39)
    shape.cylinder(0.155, 4.55, (0, 0, 2.53), (0.39, 0.60, 0.62), sides=12)
    profile = [(0.37, 0.57), (0.30, 1.42), (0.31, 2.57), (0.38, 3.62),
               (0.51, 4.28), (0.76, 4.96), (0.99, 5.50), (1.04, 5.86)]
    for i in range(12):
        angle = i * math.tau / 12
        points = [(r * math.cos(angle), r * math.sin(angle), z) for r, z in profile]
        for start, end in zip(points, points[1:]):
            beam(shape, start, end, 0.047)
        # Диагонали делают крону ажурной, а не похожей на сплошную колонну.
        for level in range(3, 6):
            r0, z0 = profile[level]
            r1, z1 = profile[level + 1]
            for shift in (-1, 1):
                next_angle = angle + shift * math.tau / 12
                beam(shape, (r0 * math.cos(angle), r0 * math.sin(angle), z0),
                     (r1 * math.cos(next_angle), r1 * math.sin(next_angle), z1), 0.024)
    for r, z in ((0.305, 1.42), (0.315, 2.57), (0.385, 3.62), (0.515, 4.28), (0.765, 4.96)):
        ring(shape, r, z, 0.031, WHITE, sides=24)
    globe(shape, (0, 0, 5.89), 0.91,
          [GOLD, (0.95, 0.74, 0.27), PALE_GOLD, (0.82, 0.54, 0.15), (0.93, 0.69, 0.20)], rows=12)
    ring(shape, 0.918, 5.89, 0.018, PALE_GOLD, sides=24)
    ring(shape, 0.575, 5.20, 0.042, GOLD, sides=24)
    shape.box((0.30, 0.05, 0.30), (0, -0.50, 0.38), DARK)
    shape.box((0.035, 0.065, 0.30), (0, -0.515, 0.38), PALE_GOLD)
    shape.normalize()
    return shape


def khan_shatyr():
    shape = Shape()
    ellipse(shape, 2.8, 2.2, 0.12, 0.06, STONE)
    ellipse(shape, 2.69, 2.09, 0.13, 0.185, WHITE)
    ellipse(shape, 2.56, 1.99, 0.35, 0.41, DARK)
    ring(shape, 2.63, 0.59, 0.055, WHITE, y_scale=2.03 / 2.63)
    sectors, steps = 32, (0, 0.18, 0.36, 0.53, 0.68, 0.81, 0.91, 1)

    def point(t, angle, offset=0):
        return (-0.70 * t + (2.64 * (1 - t) + offset) * math.cos(angle),
                0.12 * t + (2.04 * (1 - t) + offset) * math.sin(angle),
                0.59 + 3.80 * t ** 1.36)

    colors = [(0.82, 0.88, 0.85), (0.92, 0.92, 0.82), (0.74, 0.84, 0.83),
              (0.89, 0.91, 0.84), (0.82, 0.87, 0.79)]
    for level, (t0, t1) in enumerate(zip(steps, steps[1:])):
        for i in range(sectors):
            a, b = i * math.tau / sectors, (i + 1) * math.tau / sectors
            vertices = [point(t0, a), point(t0, b), point(t1, b), point(t1, a)]
            shape.mesh(vertices, [(0, 1, 2) if t1 == 1 else (0, 1, 2, 3)], colors[(i + level) % len(colors)])
    for i in range(sectors):
        angle = i * math.tau / sectors
        points = [point(t, angle, 0.012 * (1 - t)) for t in steps]
        for start, end in zip(points, points[1:]):
            beam(shape, start, end, 0.018, WHITE)
        beam(shape, (2.58 * math.cos(angle), 1.99 * math.sin(angle), 0.27),
             (2.58 * math.cos(angle), 1.99 * math.sin(angle), 0.55), 0.020, WHITE)
    # Горизонтальные швы подчёркивают мембранную оболочку без прозрачности и сортировки альфа.
    for t in (0.18, 0.36, 0.53, 0.68, 0.81):
        for i in range(sectors):
            a, b = i * math.tau / sectors, (i + 1) * math.tau / sectors
            shape.mesh([point(t - 0.002, a, 0.008), point(t - 0.002, b, 0.008),
                        point(t + 0.002, b, 0.008), point(t + 0.002, a, 0.008)],
                       [(0, 1, 2, 3)], (0.69, 0.78, 0.77))
    beam(shape, (-0.59, 0.10, 3.94), (-0.76, 0.13, 4.69), 0.032, WHITE, sides=6)
    shape.box((0.88, 0.30, 0.13), (0.18, -1.96, 0.31), WHITE, bevel=0.02)
    shape.box((0.69, 0.045, 0.27), (0.18, -2.03, 0.31), TEAL)
    shape.normalize()
    return shape


def peace_pyramid():
    shape = Shape()
    shape.box((3.8, 3.8, 0.12), (0, 0, 0.06), STONE, bevel=0.025)
    shape.box((3.66, 3.66, 0.10), (0, 0, 0.17), WHITE)
    corners = [Vector((-1.76, -1.76, 0.22)), Vector((1.76, -1.76, 0.22)),
               Vector((1.76, 1.76, 0.22)), Vector((-1.76, 1.76, 0.22))]
    apex = Vector((0, 0, 3.50))
    shades = [(0.20, 0.48, 0.59), (0.32, 0.60, 0.68), (0.18, 0.42, 0.56),
              (0.50, 0.72, 0.76), (0.27, 0.55, 0.66)]
    rows = 7
    for side in range(4):
        left, right = corners[side], corners[(side + 1) % 4]
        normal = (right - left).cross(apex - left).normalized()
        shape.mesh([tuple(left), tuple(right), tuple(apex)], [(0, 1, 2)], DARK)

        def p(i, j):
            return left + (right - left) * i / rows + (apex - left) * j / rows

        def panel(vertices, color):
            center = sum(vertices, Vector()) / 3
            shape.mesh([tuple(center + (vertex - center) * 0.947 + normal * 0.004) for vertex in vertices],
                       [(0, 1, 2)], color)

        for row in range(rows):
            for i in range(rows - row):
                color = (0.57, 0.63, 0.62) if row < 2 else shades[(row * 2 + i + side) % len(shades)]
                panel([p(i, row), p(i + 1, row), p(i, row + 1)], color)
                if i < rows - row - 1:
                    color = (0.70, 0.73, 0.68) if row < 2 else shades[(row + i * 2 + side + 1) % len(shades)]
                    panel([p(i + 1, row), p(i + 1, row + 1), p(i, row + 1)], color)
        beam(shape, left, apex, 0.025, (0.76, 0.85, 0.82))
    shape.box((0.71, 0.16, 0.27), (0, -1.67, 0.29), DARK)
    shape.box((0.84, 0.36, 0.06), (0, -1.60, 0.47), WHITE)
    shape.normalize()
    return shape


def nur_alem():
    shape = Shape()
    shape.cylinder(1.9, 0.11, (0, 0, 0.055), STONE, sides=32)
    shape.cylinder(1.76, 0.11, (0, 0, 0.165), WHITE, sides=32)
    shape.cylinder(1.18, 0.59, (0, 0, 0.505), DARK, sides=24)
    ring(shape, 1.21, 0.23, 0.07, WHITE, sides=24)
    ring(shape, 1.21, 0.75, 0.07, WHITE, sides=24)
    for i in range(20):
        a = i * math.tau / 20
        beam(shape, (1.19 * math.cos(a), 1.19 * math.sin(a), 0.28),
             (1.19 * math.cos(a), 1.19 * math.sin(a), 0.72), 0.025, (0.64, 0.78, 0.80))
    center, radius, sectors, rows = (0, 0, 2.55), 1.85, 32, 16
    globe(shape, center, radius,
          [(0.17, 0.43, 0.57), (0.18, 0.51, 0.63), (0.29, 0.61, 0.71),
           (0.22, 0.54, 0.65), (0.13, 0.38, 0.51), (0.35, 0.64, 0.72)], sectors, rows)
    frame = (0.11, 0.28, 0.36)
    # Тонкие полосы повторяют огранку стекла, поэтому не требуют дорогих цилиндров по каждому шву.
    for row in range(1, rows):
        latitude = -math.pi / 2 + math.pi * row / rows
        for i in range(sectors):
            left, right = i * math.tau / sectors, (i + 1) * math.tau / sectors
            shape.mesh([sphere_point(center, radius + 0.008, left, latitude - 0.005),
                        sphere_point(center, radius + 0.008, right, latitude - 0.005),
                        sphere_point(center, radius + 0.008, right, latitude + 0.005),
                        sphere_point(center, radius + 0.008, left, latitude + 0.005)], [(0, 1, 2, 3)], frame)
    for i in range(sectors):
        longitude = i * math.tau / sectors
        for row in range(1, rows - 1):
            low, high = -math.pi / 2 + math.pi * row / rows, -math.pi / 2 + math.pi * (row + 1) / rows
            shape.mesh([sphere_point(center, radius + 0.010, longitude - 0.004, low),
                        sphere_point(center, radius + 0.010, longitude + 0.004, low),
                        sphere_point(center, radius + 0.010, longitude + 0.004, high),
                        sphere_point(center, radius + 0.010, longitude - 0.004, high)], [(0, 1, 2, 3)], frame)
    shape.box((0.75, 0.55, 0.10), (0, -1.23, 0.60), WHITE, bevel=0.015)
    shape.box((0.57, 0.045, 0.33), (0, -1.185, 0.39), TEAL)
    shape.normalize()
    return shape


BUILDERS = {"baiterek": baiterek, "khan-shatyr": khan_shatyr,
            "peace-pyramid": peace_pyramid, "nur-alem": nur_alem}


def validate(path):
    data = path.read_bytes()
    magic, version, length = struct.unpack_from("<4sII", data)
    assert magic == b"glTF" and version == 2 and length == len(data)
    json_length, kind = struct.unpack_from("<II", data, 12)
    assert kind == 0x4E4F534A
    document = json.loads(data[20:20 + json_length])
    assert len(document["scenes"]) == 1 and document["scenes"][0]["nodes"] == [0]
    assert len(document["nodes"]) == len(document["meshes"]) == len(document["materials"]) == 1
    assert len(document["buffers"]) == 1 and "uri" not in document["buffers"][0]
    assert not any(document.get(key) for key in ("textures", "images", "animations", "skins", "extensionsRequired"))
    assert not any(key in document["nodes"][0] for key in ("matrix", "translation", "rotation", "scale"))
    primitive, = document["meshes"][0]["primitives"]
    assert primitive.get("mode", 4) == 4 and not primitive.get("extensions")
    assert all(key in primitive["attributes"] for key in ("POSITION", "NORMAL", "COLOR_0"))
    mat, = document["materials"]
    assert mat.get("alphaMode", "OPAQUE") == "OPAQUE"
    assert mat["pbrMetallicRoughness"].get("metallicFactor", 1) == 0
    assert abs(mat["pbrMetallicRoughness"].get("roughnessFactor", 1) - 0.55) < 1e-5
    position = document["accessors"][primitive["attributes"]["POSITION"]]
    low, high = position["min"], position["max"]
    assert abs(low[1]) < 1e-5 and abs(low[0] + high[0]) < 1e-5 and abs(low[2] + high[2]) < 1e-5
    binary_offset = 20 + json_length + 8
    for name in ("POSITION", "NORMAL", "COLOR_0"):
        accessor = document["accessors"][primitive["attributes"][name]]
        view = document["bufferViews"][accessor["bufferView"]]
        width = {"VEC3": 3, "VEC4": 4}[accessor["type"]]
        fmt, byte_count = {5126: ("f", 4), 5123: ("H", 2), 5121: ("B", 1)}[accessor["componentType"]]
        stride = view.get("byteStride", width * byte_count)
        start = binary_offset + view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
        for i in range(accessor["count"]):
            value = struct.unpack_from("<" + fmt * width, data, start + i * stride)
            assert all(math.isfinite(v) for v in value), (path.name, name)
            if name == "NORMAL":
                assert abs(sum(v * v for v in value) - 1) < 1e-4, (path.name, value)
            if name == "COLOR_0":
                maximum = 1 if fmt == "f" else (65535 if fmt == "H" else 255)
                assert all(0 <= v <= maximum for v in value) and value[3] == maximum
    return {"file": path.name, "bytes": len(data), "triangles": document["accessors"][primitive["indices"]]["count"] // 3,
            "vertices": position["count"], "min": low, "max": high}


def preview(objects, shared_material):
    scene = bpy.context.scene
    positions = [(-4.0, 3.8, 0.10), (2.7, 3.8, 0.10), (-4.0, -3.8, 0.10), (3.3, -3.8, 0.10)]
    for obj, position in zip(objects, positions):
        obj.location = position
    floor = Shape()
    floor.box((200, 200, 0.08), (0, 0, 0.02), (0.87, 0.90, 0.89))
    floor.object("preview-floor", shared_material)
    camera_data = bpy.data.cameras.new("preview-camera")
    camera_data.type, camera_data.ortho_scale = "ORTHO", 18.5
    camera = bpy.data.objects.new("preview-camera", camera_data)
    scene.collection.objects.link(camera)
    target = Vector((-0.15, 0.50, 2.2))
    direction = Vector((0.20, -0.85, 0.68)).normalized()
    camera.location = target + direction * 30
    camera.rotation_euler = (-direction).to_track_quat("-Z", "Y").to_euler()
    scene.camera = camera
    for name, position, energy, size in (("key", (-6, -5, 13), 1200, 8), ("fill", (7, 5, 10), 800, 7)):
        light = bpy.data.lights.new(name, "AREA")
        light.energy, light.shape, light.size = energy, "DISK", size
        obj = bpy.data.objects.new(name, light)
        obj.location = position
        obj.rotation_euler = (Vector((0, 0, 1)) - obj.location).to_track_quat("-Z", "Y").to_euler()
        scene.collection.objects.link(obj)
    world = bpy.data.worlds.new("preview-world")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.78, 0.86, 0.96, 1)
    world.node_tree.nodes["Background"].inputs[1].default_value = 0.5
    scene.world = world
    scene.render.engine, scene.cycles.device = "CYCLES", "CPU"
    scene.cycles.samples, scene.cycles.seed, scene.cycles.use_denoising = 32, 0, True
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.exposure = -0.5
    scene.render.resolution_x, scene.render.resolution_y, scene.render.resolution_percentage = 1600, 1300, 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.filepath = str(OUTPUT / "landmarks-preview.png")
    bpy.ops.render.render(write_still=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--skip-preview", action="store_true")
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
    bpy.ops.wm.read_factory_settings(use_empty=True)
    shared_material = material()
    shared_material.name = "landmark-vertex-color"
    shared_material.node_tree.nodes.get("Principled BSDF").inputs["Roughness"].default_value = 0.55
    objects, report = [], []
    for name, builder in BUILDERS.items():
        obj = builder().object(name, shared_material)
        export(obj)
        objects.append(obj)
        report.append(validate(OUTPUT / (name + ".glb")))
    total = sum(item["bytes"] for item in report)
    whole_kit = sum(path.stat().st_size for path in OUTPUT.glob("*.glb"))
    assert whole_kit < 2_000_000, whole_kit
    result = {"totalBytes": total, "wholeKitBytes": whole_kit, "models": report}
    (OUTPUT / "landmarks-manifest.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result), flush=True)
    if not args.skip_preview:
        preview(objects, shared_material)


if __name__ == "__main__":
    main()
