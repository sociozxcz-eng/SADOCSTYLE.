"""Process queued garments on a trusted GitHub-hosted runner."""
import base64
import io
import json
import os
import re
import sys
import urllib.request
from pathlib import Path

ENDPOINT = "https://ozgpmnmmaxwuyedioetw.supabase.co/functions/v1/revision-ropa"

def rpc(**payload):
    url = os.environ["ACTIONS_ID_TOKEN_REQUEST_URL"] + "&audience=sadoc-revision-ropa"
    auth = {"Authorization": "Bearer " + os.environ["ACTIONS_ID_TOKEN_REQUEST_TOKEN"]}
    with urllib.request.urlopen(urllib.request.Request(url, headers=auth), timeout=30) as response:
        token = json.load(response)["value"]
    request = urllib.request.Request(ENDPOINT, data=json.dumps(payload).encode(),
        headers={"Authorization": "Bearer " + token, "Content-Type": "application/json"})
    with urllib.request.urlopen(request, timeout=35) as response:
        return json.load(response)

def classifier():
    import torch
    from transformers import CLIPModel, CLIPProcessor
    model_id = "openai/clip-vit-base-patch32"
    revision = "3d74acf9a28c67741b2f4f2ea7635f0aaf6f0268"
    processor = CLIPProcessor.from_pretrained(model_id, revision=revision)
    model = CLIPModel.from_pretrained(model_id, revision=revision, use_safetensors=False).eval()
    allowed = [
        "a product photo of clothing, such as a shirt, hoodie, jacket, or sweater",
        "a product photo of clothing, such as trousers, jeans, shorts, skirt or dress",
        "a product photo of children's clothes, pajamas, or a matching outfit",
        "a person modeling a garment for a clothing store",
        "a pet wearing a garment for sale",
        "a toy, vehicle, furniture, appliance, or electronic device",
        "a gift box, candle, food, or other non-clothing product",
        "shoes, jewelry, a bag or accessories without a garment",
        "ordinary home decor, crafts, kitchen utensils or other household goods",
        "a book, artwork, stationery or a general retail product",
    ]
    prohibited = [
        "a firearm, ammunition, explosive or other real weapon for sale",
        "illegal drugs for sale",
        "adult sex products or sexually explicit material",
        "age-restricted merchandise: tobacco, vaping devices or alcoholic beverages",
        "explicit nudity or sexual imagery", "a hateful symbol or violent scene",

    ]
    labels = allowed + prohibited
    def classify(image):
        inputs = processor(text=labels, images=image.convert("RGB"), return_tensors="pt", padding=True)
        with torch.inference_mode():
            scores = model(**inputs).logits_per_image.softmax(dim=1)[0]
        return "rejected" if scores[len(allowed):].sum().item() >= .5 else "approved"
    return classify

def main():
    if sys.argv[1] == "queue":
        rows = rpc(action="list")
        Path(os.environ["GITHUB_OUTPUT"]).open("a").write(f"pending={len(rows)}\n")
        return
    from PIL import Image, UnidentifiedImageError
    classify = classifier()
    for fixture, expected in [("buzo-frente.jpg","approved"),("velitas-primera-compra.jpg","approved")]:
        with Image.open(Path("assets") / fixture) as image:
            if classify(image) != expected:
                raise RuntimeError("Falló la prueba de clasificación: " + fixture)
    for item in rpc(action="list"):
        listing = rpc(action="read", id=item["id"])
        if not listing:
            continue
        text = listing["name"] + " " + listing["description"]
        blocked = re.search(r"\b(coca[ií]na|hero[ií]na|pornograf[ií]a|vendo armas|venta de armas|contenido (?:sexual|para adultos)|material (?:robado|pornogr[aá]fico)|vapeadores?|cigarrillos|municiones)\b", text, re.I)
        decision = "rejected"
        if not blocked:
            try:
                data = base64.b64decode(listing["image"].partition(",")[2], validate=True)
                with Image.open(io.BytesIO(data)) as photo:
                    if photo.format == "JPEG" and photo.width * photo.height <= 16000000:
                        decision = classify(photo)
            except (UnidentifiedImageError, ValueError, OSError, Image.DecompressionBombError):
                pass
        rpc(action="decide", id=item["id"], decision=decision)

if __name__ == "__main__":
    main()
