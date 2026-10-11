# Exporta a ONNX el CLIP exactamente como lo ejecuta el servicio Python de la nube
# (open_clip ViT-B-32 con pesos 'openai' y la activación GELU de esa configuración).
# Se ejecuta con el entorno de App/python_cpu; `onnx` llega por una carpeta aparte (argv[2]).
# Uso: python export_clip.py <carpeta de salida> <carpeta con onnx instalado>
import os
import sys

sys.path.insert(0, sys.argv[2])

import warnings  # noqa: E402

import open_clip  # noqa: E402
import torch  # noqa: E402

out = sys.argv[1]
warnings.filterwarnings("ignore")
model, _, _ = open_clip.create_model_and_transforms("ViT-B-32", pretrained="openai")
model.eval()


class TextEncoder(torch.nn.Module):
    def __init__(self, m):
        super().__init__()
        self.m = m

    def forward(self, input_ids):
        return self.m.encode_text(input_ids)


class ImageEncoder(torch.nn.Module):
    def __init__(self, m):
        super().__init__()
        self.m = m

    def forward(self, pixel_values):
        return self.m.encode_image(pixel_values)


# Sin inference_mode: en ese modo PyTorch usa una atención optimizada que el exportador no traduce.
torch.onnx.export(
    TextEncoder(model),
    (torch.zeros(1, 77, dtype=torch.long),),
    os.path.join(out, "clip_text.onnx"),
    input_names=["input_ids"],
    output_names=["text_embeds"],
    dynamic_axes={"input_ids": {0: "batch"}, "text_embeds": {0: "batch"}},
    opset_version=17,
    dynamo=False,
)
torch.onnx.export(
    ImageEncoder(model),
    (torch.zeros(1, 3, 224, 224),),
    os.path.join(out, "clip_image.onnx"),
    input_names=["pixel_values"],
    output_names=["image_embeds"],
    dynamic_axes={"pixel_values": {0: "batch"}, "image_embeds": {0: "batch"}},
    opset_version=17,
    dynamo=False,
)
print(f"CLIP exportado en {out} (open_clip {open_clip.__version__}, torch {torch.__version__})")
