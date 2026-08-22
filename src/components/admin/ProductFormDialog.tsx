import { useEffect, useMemo, useState } from "react";
import { ImageUp, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { imageFor, type Product, type Variant } from "@/lib/catalog";
import { useTaxonomy } from "@/lib/taxonomy";
import {
  PRODUCT_IMAGE_ACCEPT,
  removeProductImages,
  uploadProductImage,
} from "@/lib/product-images";
import { addProduct, nextProductId, updateProduct } from "@/lib/store";

const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-foreground text-sm outline-none focus-visible:border-ring [&>option]:bg-background [&>option]:text-foreground";

const slugify = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

type Draft = {
  name: string;
  brand: string;
  category: string;
  price: string;
  stock: string;
  soldOut: boolean;
  description: string;
  images: string[];
  variants: Variant[];
  sku: string;
  weightKg: string;
  widthCm: string;
  heightCm: string;
  lengthCm: string;
};

function toDraft(
  product: Product | null,
  categories: ReturnType<typeof useTaxonomy>["categories"],
  brands: string[],
): Draft {
  if (!product) {
    return {
      name: "",
      brand: brands[0] ?? "",
      category: categories[0]?.slug ?? "shapes",
      price: "",
      stock: "10",
      soldOut: false,
      description: "",
      images: [],
      variants: [],
      sku: "",
      weightKg: "0,5",
      widthCm: "20",
      heightCm: "10",
      lengthCm: "30",
    };
  }
  return {
    name: product.name,
    brand: product.brand,
    category: product.category,
    price: String(product.basePrice ?? product.price).replace(".", ","),
    stock: String(product.stock),
    soldOut: Boolean(product.soldOut),
    description: product.description,
    images: product.images.length ? product.images : [categories[0]?.image ?? imageFor("shapes")],
    variants: product.variants ?? [],
    sku: product.sku,
    weightKg: String(product.shipping?.weightKg ?? 0.5).replace(".", ","),
    widthCm: String(product.shipping?.widthCm ?? 20),
    heightCm: String(product.shipping?.heightCm ?? 10),
    lengthCm: String(product.shipping?.lengthCm ?? 30),
  };
}

export function ProductFormDialog({
  open,
  product,
  onOpenChange,
}: {
  open: boolean;
  product: Product | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { categories, brands: managedBrands } = useTaxonomy();
  const brands = useMemo(() => managedBrands.map((brand) => brand.name), [managedBrands]);
  const [draft, setDraft] = useState<Draft>(() => toDraft(product, categories, brands));
  const [uploading, setUploading] = useState(false);
  const [pendingUploads, setPendingUploads] = useState<string[]>([]);

  useEffect(() => {
    if (open) {
      setDraft(toDraft(product, categories, brands));
      setPendingUploads([]);
      setUploading(false);
    }
  }, [open, product, categories, brands]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  function closeWithoutSaving() {
    if (pendingUploads.length) void removeProductImages(pendingUploads);
    setPendingUploads([]);
    onOpenChange(false);
  }

  async function uploadImages(files: FileList | null) {
    if (!files?.length || uploading) return;
    const selected = Array.from(files);
    const freeSlots = Math.max(0, 8 - draft.images.filter(Boolean).length);
    if (!freeSlots) {
      toast.error("Cada produto pode ter até 8 imagens.");
      return;
    }

    setUploading(true);
    const uploaded: string[] = [];
    try {
      for (const file of selected.slice(0, freeSlots)) {
        uploaded.push(await uploadProductImage(file));
      }
      setDraft((current) => ({
        ...current,
        images: [...current.images.filter(Boolean), ...uploaded],
      }));
      setPendingUploads((current) => [...current, ...uploaded]);
      toast.success(
        uploaded.length === 1 ? "Imagem enviada." : `${uploaded.length} imagens enviadas.`,
      );
      if (selected.length > freeSlots) toast.info("O limite de 8 imagens foi aplicado.");
    } catch (error) {
      if (uploaded.length) {
        setDraft((current) => ({
          ...current,
          images: [...current.images.filter(Boolean), ...uploaded],
        }));
        setPendingUploads((current) => [...current, ...uploaded]);
      }
      toast.error(error instanceof Error ? error.message : "Não foi possível enviar a imagem.");
    } finally {
      setUploading(false);
    }
  }

  function removeImage(index: number) {
    const image = draft.images[index];
    set(
      "images",
      draft.images.filter((_, itemIndex) => itemIndex !== index),
    );
    if (pendingUploads.includes(image)) {
      setPendingUploads((current) => current.filter((url) => url !== image));
      void removeProductImages([image]);
    }
  }

  function save() {
    const price = Number(draft.price.replace(",", "."));
    const shipping = {
      weightKg: Number(draft.weightKg.replace(",", ".")),
      widthCm: Number(draft.widthCm),
      heightCm: Number(draft.heightCm),
      lengthCm: Number(draft.lengthCm),
    };
    if (draft.name.trim().length < 3) {
      toast.error("Informe um nome com pelo menos 3 caracteres.");
      return;
    }
    if (!Number.isFinite(price) || price <= 0) {
      toast.error("Informe um preço válido.");
      return;
    }
    if (
      !Number.isFinite(shipping.weightKg) ||
      shipping.weightKg <= 0 ||
      [shipping.widthCm, shipping.heightCm, shipping.lengthCm].some(
        (value) => !Number.isInteger(value) || value <= 0,
      )
    ) {
      toast.error("Informe peso e dimensões válidos para calcular o frete.");
      return;
    }
    const images = draft.images.map((i) => i.trim()).filter(Boolean);
    const variants = draft.variants.filter((v) => v.size.trim() || v.color.trim());
    const stock = variants.length
      ? variants.reduce((acc, v) => acc + Math.max(0, v.stock), 0)
      : Math.max(0, Number(draft.stock) || 0);

    if (product) {
      updateProduct(product.id, {
        name: draft.name.trim(),
        brand: draft.brand,
        category: draft.category,
        price,
        basePrice: price,
        stock,
        soldOut: draft.soldOut,
        variants,
        description: draft.description.trim(),
        images: images.length ? images : product.images,
        specs: [
          { label: "Marca", value: draft.brand },
          { label: "SKU", value: product.sku },
          { label: "Garantia", value: "3 meses contra defeito de fabricação" },
        ],
        shipping,
      });
      toast.success(`${draft.name.trim()} atualizado.`);
    } else {
      const id = nextProductId();
      const fallback =
        categories.find((c) => c.slug === draft.category)?.image ??
        categories[0]?.image ??
        imageFor("shapes");
      const newProduct: Product = {
        id,
        sku: draft.sku.trim() || `DRP-${id.padStart(4, "0")}`,
        slug: `${slugify(draft.name)}-${id}`,
        name: draft.name.trim(),
        brand: draft.brand,
        category: draft.category,
        price,
        basePrice: price,
        rating: 5,
        reviews: 0,
        stock,
        soldOut: draft.soldOut,
        variants,
        images: images.length ? images : [fallback, fallback, fallback],
        description:
          draft.description.trim() ||
          `${draft.name.trim()} da ${draft.brand}, novo item da curadoria DROP Skate Shop.`,
        specs: [
          { label: "Marca", value: draft.brand },
          { label: "SKU", value: draft.sku.trim() || `DRP-${id.padStart(4, "0")}` },
          { label: "Garantia", value: "3 meses contra defeito de fabricação" },
        ],
        tags: ["lancamentos"],
        shipping,
      };
      addProduct(newProduct);
      toast.success(`${newProduct.name} adicionado ao catálogo.`);
    }
    setPendingUploads([]);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : closeWithoutSaving())}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="uppercase">
            {product ? "Editar produto" : "Novo produto"}
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="pf-nome">Nome</Label>
            <Input
              id="pf-nome"
              value={draft.name}
              maxLength={120}
              onChange={(e) => set("name", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pf-marca">Marca</Label>
            <select
              id="pf-marca"
              className={selectClass}
              value={draft.brand}
              onChange={(e) => set("brand", e.target.value)}
            >
              {brands.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="pf-cat">Categoria</Label>
            <select
              id="pf-cat"
              className={selectClass}
              value={draft.category}
              onChange={(e) => set("category", e.target.value)}
            >
              {categories.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="pf-preco">Preço cheio (R$)</Label>
            <Input
              id="pf-preco"
              inputMode="decimal"
              maxLength={10}
              value={draft.price}
              onChange={(e) => set("price", e.target.value)}
              placeholder="349,90"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pf-sku">SKU</Label>
            <Input
              id="pf-sku"
              maxLength={20}
              value={draft.sku}
              disabled={!!product}
              onChange={(e) => set("sku", e.target.value)}
              placeholder="DRP-0025"
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="pf-desc">Descrição</Label>
            <Textarea
              id="pf-desc"
              rows={4}
              maxLength={1000}
              value={draft.description}
              onChange={(e) => set("description", e.target.value)}
            />
          </div>
          <div className="space-y-3 rounded-lg border border-border p-4 sm:col-span-2">
            <div>
              <p className="font-display text-sm uppercase">Peso e dimensões para frete</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Informe o produto já embalado. Peso em kg e medidas em cm.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="space-y-2">
                <Label htmlFor="pf-weight">Peso (kg)</Label>
                <Input
                  id="pf-weight"
                  inputMode="decimal"
                  value={draft.weightKg}
                  onChange={(event) => set("weightKg", event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pf-width">Largura (cm)</Label>
                <Input
                  id="pf-width"
                  inputMode="numeric"
                  value={draft.widthCm}
                  onChange={(event) => set("widthCm", event.target.value.replace(/\D/g, ""))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pf-height">Altura (cm)</Label>
                <Input
                  id="pf-height"
                  inputMode="numeric"
                  value={draft.heightCm}
                  onChange={(event) => set("heightCm", event.target.value.replace(/\D/g, ""))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pf-length">Comprimento (cm)</Label>
                <Input
                  id="pf-length"
                  inputMode="numeric"
                  value={draft.lengthCm}
                  onChange={(event) => set("lengthCm", event.target.value.replace(/\D/g, ""))}
                />
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-4 sm:col-span-2">
            <div>
              <Label htmlFor="pf-sold-out" className="font-display uppercase">
                Marcar como esgotado
              </Label>
              <p className="mt-1 text-xs text-muted-foreground">
                Mantém o produto e suas fotos visíveis, mas bloqueia a compra.
              </p>
            </div>
            <Switch
              id="pf-sold-out"
              checked={draft.soldOut}
              onCheckedChange={(checked) => set("soldOut", checked)}
              aria-label="Marcar produto como esgotado"
            />
          </div>
        </div>

        {/* Imagens */}
        <div className="space-y-3 rounded-lg border border-border p-4">
          <p className="font-display text-sm uppercase">Imagens</p>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="surface" size="sm" asChild disabled={uploading}>
              <label className="cursor-pointer">
                {uploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ImageUp className="h-4 w-4" />
                )}
                {uploading ? "Enviando..." : "Enviar fotos"}
                <input
                  type="file"
                  className="sr-only"
                  accept={PRODUCT_IMAGE_ACCEPT}
                  multiple
                  disabled={uploading}
                  onChange={(event) => {
                    void uploadImages(event.target.files);
                    event.target.value = "";
                  }}
                />
              </label>
            </Button>
            <span className="text-xs text-muted-foreground">JPG, PNG ou WebP · máximo 5 MB</span>
          </div>
          {draft.images.map((img, i) => (
            <div key={i} className="flex items-center gap-3">
              <img
                src={img}
                alt=""
                width={40}
                height={40}
                className="h-10 w-10 rounded object-cover"
              />
              <Input
                value={img}
                maxLength={400}
                aria-label={`URL da imagem ${i + 1}`}
                onChange={(e) =>
                  set(
                    "images",
                    draft.images.map((v, idx) => (idx === i ? e.target.value : v)),
                  )
                }
              />
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Remover imagem ${i + 1}`}
                onClick={() => removeImage(i)}
              >
                <Trash2 className="h-4 w-4 text-primary" />
              </Button>
            </div>
          ))}
          <Button
            variant="surface"
            size="sm"
            disabled={draft.images.length >= 8 || uploading}
            onClick={() => set("images", [...draft.images, ""])}
          >
            <Plus className="h-4 w-4" /> Adicionar imagem
          </Button>
        </div>

        {/* Variações */}
        <div className="space-y-3 rounded-lg border border-border p-4">
          <p className="font-display text-sm uppercase">Variações (tamanho / cor)</p>
          {draft.variants.length === 0 && (
            <div className="space-y-2">
              <Label htmlFor="pf-stock">Estoque (sem variações)</Label>
              <Input
                id="pf-stock"
                inputMode="numeric"
                maxLength={5}
                className="max-w-32"
                value={draft.stock}
                onChange={(e) => set("stock", e.target.value)}
              />
            </div>
          )}
          {draft.variants.map((v, i) => (
            <div key={v.id} className="flex flex-wrap items-end gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Tamanho</Label>
                <Input
                  className="w-24"
                  maxLength={10}
                  value={v.size}
                  onChange={(e) =>
                    set(
                      "variants",
                      draft.variants.map((x, idx) =>
                        idx === i ? { ...x, size: e.target.value } : x,
                      ),
                    )
                  }
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Cor</Label>
                <Input
                  className="w-32"
                  maxLength={20}
                  value={v.color}
                  onChange={(e) =>
                    set(
                      "variants",
                      draft.variants.map((x, idx) =>
                        idx === i ? { ...x, color: e.target.value } : x,
                      ),
                    )
                  }
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Estoque</Label>
                <Input
                  className="w-24"
                  inputMode="numeric"
                  maxLength={5}
                  value={String(v.stock)}
                  onChange={(e) =>
                    set(
                      "variants",
                      draft.variants.map((x, idx) =>
                        idx === i ? { ...x, stock: Math.max(0, Number(e.target.value) || 0) } : x,
                      ),
                    )
                  }
                />
              </div>
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Remover variação ${i + 1}`}
                onClick={() =>
                  set(
                    "variants",
                    draft.variants.filter((_, idx) => idx !== i),
                  )
                }
              >
                <Trash2 className="h-4 w-4 text-primary" />
              </Button>
            </div>
          ))}
          <Button
            variant="surface"
            size="sm"
            onClick={() =>
              set("variants", [
                ...draft.variants,
                {
                  id: `v-${Date.now()}-${draft.variants.length}`,
                  size: "Único",
                  color: "Preto",
                  stock: 0,
                },
              ])
            }
          >
            <Plus className="h-4 w-4" /> Adicionar variação
          </Button>
        </div>

        <DialogFooter>
          <Button variant="surface" size="sm" disabled={uploading} onClick={closeWithoutSaving}>
            Cancelar
          </Button>
          <Button variant="hero" size="sm" disabled={uploading} onClick={save}>
            {product ? "Salvar alterações" : "Criar produto"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
