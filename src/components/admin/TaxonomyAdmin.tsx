import { useEffect, useState } from "react";
import { ImageUp, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { uploadProductImage } from "@/lib/product-images";
import { updateProduct, useProducts } from "@/lib/store";
import {
  deleteManagedBrand,
  deleteManagedCategory,
  saveManagedBrand,
  saveManagedCategory,
  slugifyTaxonomy,
  useTaxonomy,
  type CategoryGroup,
  type ManagedBrand,
  type ManagedCategory,
} from "@/lib/taxonomy";

const groups: CategoryGroup[] = ["Skate", "Vestuário", "Acessórios"];
const selectClass = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm";

async function uploadOne(file: File | undefined, onUploaded: (url: string) => void) {
  if (!file) return;
  try {
    onUploaded(await uploadProductImage(file));
    toast.success("Imagem enviada.");
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "Não foi possível enviar a imagem.");
  }
}

function CategoryRow({ category }: { category: ManagedCategory }) {
  const [draft, setDraft] = useState(category);
  const [saving, setSaving] = useState(false);
  useEffect(() => setDraft(category), [category]);

  const save = async () => {
    if (!draft.name.trim()) return toast.error("Informe o nome da categoria.");
    setSaving(true);
    try {
      await saveManagedCategory(draft, category.slug);
      toast.success("Categoria atualizada.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-3 rounded-lg border border-border bg-card p-4 lg:grid-cols-[64px_1fr_180px_100px_auto] lg:items-end">
      <img src={draft.image} alt="" className="h-14 w-14 rounded object-cover" />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label>Nome</Label>
          <Input
            value={draft.name}
            maxLength={80}
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
          />
        </div>
        <div className="space-y-1">
          <Label>Imagem</Label>
          <div className="flex gap-2">
            <Input
              value={draft.image}
              maxLength={1000}
              onChange={(event) => setDraft({ ...draft, image: event.target.value })}
            />
            <Button variant="surface" size="icon" asChild title="Enviar imagem">
              <label className="cursor-pointer">
                <ImageUp className="h-4 w-4" />
                <input
                  className="sr-only"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(event) => {
                    void uploadOne(event.target.files?.[0], (image) =>
                      setDraft((current) => ({ ...current, image })),
                    );
                    event.target.value = "";
                  }}
                />
              </label>
            </Button>
          </div>
        </div>
      </div>
      <div className="space-y-1">
        <Label>Grupo</Label>
        <select
          className={selectClass}
          value={draft.group}
          onChange={(event) => setDraft({ ...draft, group: event.target.value as CategoryGroup })}
        >
          {groups.map((group) => (
            <option key={group}>{group}</option>
          ))}
        </select>
      </div>
      <label className="flex h-9 items-center gap-2 text-sm">
        <Switch
          checked={draft.enabled}
          onCheckedChange={(enabled) => setDraft({ ...draft, enabled })}
        />{" "}
        Exibir
      </label>
      <div className="flex gap-2">
        <Button
          variant="hero"
          size="icon"
          disabled={saving}
          onClick={() => void save()}
          aria-label="Salvar categoria"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Excluir categoria"
          onClick={async () => {
            if (!window.confirm(`Excluir a categoria ${category.name}?`)) return;
            try {
              await deleteManagedCategory(category.slug);
              toast.success("Categoria excluída.");
            } catch (error) {
              toast.error(error instanceof Error ? error.message : "Não foi possível excluir.");
            }
          }}
        >
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>
    </div>
  );
}

function BrandRow({ brand }: { brand: ManagedBrand }) {
  const products = useProducts();
  const [draft, setDraft] = useState(brand);
  const [saving, setSaving] = useState(false);
  useEffect(() => setDraft(brand), [brand]);
  return (
    <div className="grid gap-3 rounded-lg border border-border bg-card p-4 sm:grid-cols-[1fr_110px_auto] sm:items-end">
      <div className="space-y-1">
        <Label>Nome</Label>
        <Input
          value={draft.name}
          maxLength={100}
          onChange={(event) => setDraft({ ...draft, name: event.target.value })}
        />
      </div>
      <label className="flex h-9 items-center gap-2 text-sm">
        <Switch
          checked={draft.enabled}
          onCheckedChange={(enabled) => setDraft({ ...draft, enabled })}
        />{" "}
        Exibir
      </label>
      <div className="flex gap-2">
        <Button
          variant="hero"
          size="icon"
          disabled={saving}
          aria-label="Salvar marca"
          onClick={async () => {
            if (!draft.name.trim()) return toast.error("Informe o nome da marca.");
            setSaving(true);
            try {
              await saveManagedBrand(draft, brand.id);
              if (draft.name.trim() !== brand.name) {
                products
                  .filter((product) => product.brand === brand.name)
                  .forEach((product) => updateProduct(product.id, { brand: draft.name.trim() }));
              }
              toast.success("Marca atualizada.");
            } catch (error) {
              toast.error(error instanceof Error ? error.message : "Não foi possível salvar.");
            } finally {
              setSaving(false);
            }
          }}
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Excluir marca"
          onClick={async () => {
            if (!window.confirm(`Excluir a marca ${brand.name}?`)) return;
            try {
              await deleteManagedBrand(brand.id);
              toast.success("Marca excluída.");
            } catch (error) {
              toast.error(error instanceof Error ? error.message : "Não foi possível excluir.");
            }
          }}
        >
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>
    </div>
  );
}

export function TaxonomyAdmin() {
  const { categories, brands } = useTaxonomy();
  const [categoryName, setCategoryName] = useState("");
  const [categoryGroup, setCategoryGroup] = useState<CategoryGroup>("Skate");
  const [categoryImage, setCategoryImage] = useState("");
  const [brandName, setBrandName] = useState("");

  return (
    <section>
      <p className="font-display text-xs uppercase tracking-[0.3em] text-primary">Catálogo</p>
      <h2 className="mt-2 text-3xl uppercase">Categorias e marcas</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Cadastre as opções utilizadas nos produtos, menus e filtros da loja.
      </p>

      <div className="mt-7 grid gap-8 xl:grid-cols-2">
        <div>
          <h3 className="text-xl uppercase">Categorias</h3>
          <div className="mt-4 space-y-3 rounded-lg border border-primary/30 bg-card p-4">
            <p className="font-display text-sm uppercase">Nova categoria</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Nome</Label>
                <Input
                  value={categoryName}
                  maxLength={80}
                  onChange={(event) => setCategoryName(event.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>Grupo</Label>
                <select
                  className={selectClass}
                  value={categoryGroup}
                  onChange={(event) => setCategoryGroup(event.target.value as CategoryGroup)}
                >
                  {groups.map((group) => (
                    <option key={group}>{group}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label>Imagem</Label>
                <div className="flex gap-2">
                  <Input
                    value={categoryImage}
                    maxLength={1000}
                    placeholder="URL ou envie uma imagem"
                    onChange={(event) => setCategoryImage(event.target.value)}
                  />
                  <Button variant="surface" asChild>
                    <label className="cursor-pointer">
                      <ImageUp className="h-4 w-4" /> Enviar
                      <input
                        className="sr-only"
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={(event) => {
                          void uploadOne(event.target.files?.[0], setCategoryImage);
                          event.target.value = "";
                        }}
                      />
                    </label>
                  </Button>
                </div>
              </div>
            </div>
            <Button
              variant="hero"
              onClick={async () => {
                const slug = slugifyTaxonomy(categoryName);
                if (!slug) return toast.error("Informe um nome válido.");
                try {
                  await saveManagedCategory({
                    slug,
                    name: categoryName.trim(),
                    group: categoryGroup,
                    image: categoryImage,
                    position: categories.length,
                    enabled: true,
                  });
                  setCategoryName("");
                  setCategoryImage("");
                  toast.success("Categoria criada.");
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : "Não foi possível criar.");
                }
              }}
            >
              <Plus className="h-4 w-4" /> Adicionar categoria
            </Button>
          </div>
          <div className="mt-4 space-y-3">
            {categories.map((category) => (
              <CategoryRow key={category.slug} category={category} />
            ))}
          </div>
        </div>

        <div>
          <h3 className="text-xl uppercase">Marcas</h3>
          <div className="mt-4 flex gap-2 rounded-lg border border-primary/30 bg-card p-4">
            <Input
              value={brandName}
              maxLength={100}
              placeholder="Nome da nova marca"
              onChange={(event) => setBrandName(event.target.value)}
            />
            <Button
              variant="hero"
              onClick={async () => {
                if (!brandName.trim()) return toast.error("Informe o nome da marca.");
                try {
                  await saveManagedBrand({
                    id: "",
                    name: brandName.trim(),
                    position: brands.length,
                    enabled: true,
                  });
                  setBrandName("");
                  toast.success("Marca criada.");
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : "Não foi possível criar.");
                }
              }}
            >
              <Plus className="h-4 w-4" /> Adicionar
            </Button>
          </div>
          <div className="mt-4 space-y-3">
            {brands.map((brand) => (
              <BrandRow key={brand.id} brand={brand} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
