import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Button } from "../Button";
import { Input } from "../Input";
import { Select } from "../Select";
import { Dialog } from "../Dialog";
import { Module } from "../Module";
import { Stat } from "../Stat";
import { Tag } from "../Tag";
import { EmptyState } from "../EmptyState";
import { Skeleton } from "../Skeleton";

describe("Button", () => {
  it("rend un bouton type=button, variante primaire, clic transmis", () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Valider</Button>);
    const btn = screen.getByRole("button", { name: "Valider" });
    expect(btn).toHaveAttribute("type", "button");
    expect(btn.className).toContain("bg-agon-accent");
    // Les couleurs shadcn par défaut ne doivent pas rester à côté des tokens Agon.
    expect(btn.className).not.toMatch(/\bbg-primary\b|\btext-sm\b|\bh-10 px-4\b/);
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("variantes, taille et largeur pleine", () => {
    render(
      <Button variant="danger" size="lg" block>
        Supprimer
      </Button>,
    );
    const cls = screen.getByRole("button").className;
    // Danger : contour rouge, jamais plein (canvas 12/11).
    expect(cls).toContain("text-agon-rouge");
    expect(cls.split(" ")).not.toContain("bg-agon-rouge");
    expect(cls).toContain("h-[52px]");
    expect(cls).toContain("w-full");
  });

  it("asChild rend l'enfant avec les styles", () => {
    render(
      <Button asChild variant="secondary">
        <a href="/x">Lien</a>
      </Button>,
    );
    const link = screen.getByRole("link", { name: "Lien" });
    expect(link.className).toContain("border-agon-brd-l");
    expect(link).not.toHaveAttribute("type");
  });
});

describe("Input", () => {
  it("rend un champ, 16 px sur mobile, invalid → aria-invalid", () => {
    render(<Input aria-label="Charge" invalid placeholder="kg" />);
    const input = screen.getByRole("textbox", { name: "Charge" });
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input.className).toContain("text-agon-lg");
    expect(input.className).toContain("md:text-agon-base");
    expect(input.className).not.toMatch(/(^|\s)text-base(\s|$)/);
  });
});

describe("Select", () => {
  it("affiche le placeholder puis la valeur choisie", () => {
    const options = [
      { value: "a", label: "Force" },
      { value: "b", label: "Endurance" },
    ];
    const { rerender } = render(<Select aria-label="Type" options={options} placeholder="Choisir" />);
    expect(screen.getByRole("combobox", { name: "Type" })).toHaveTextContent("Choisir");
    rerender(<Select aria-label="Type" options={options} value="b" />);
    expect(screen.getByRole("combobox", { name: "Type" })).toHaveTextContent("Endurance");
  });
});

describe("Dialog", () => {
  it("fermé : rien ; ouvert : titre, contenu, pied, bouton Fermer", () => {
    const onOpenChange = vi.fn();
    const { rerender } = render(<Dialog open={false} title="Séance" />);
    expect(screen.queryByRole("dialog")).toBeNull();
    rerender(
      <Dialog open onOpenChange={onOpenChange} title="Séance" description="Lundi" footer={<button>OK</button>}>
        <p>Contenu</p>
      </Dialog>,
    );
    const dialog = screen.getByRole("dialog", { name: "Séance" });
    expect(dialog).toHaveTextContent("Lundi");
    expect(dialog).toHaveTextContent("Contenu");
    expect(screen.getByRole("button", { name: "OK" })).toBeInTheDocument();
    // Feuille en bas sur mobile, centrée à partir de md.
    expect(dialog.className).toContain("bottom-0");
    expect(dialog.className).toContain("md:top-1/2");
    fireEvent.click(screen.getByRole("button", { name: "Fermer" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe("Module", () => {
  it("rend une région titrée avec son action", () => {
    render(
      <Module title="Charge" action={<button>Voir</button>}>
        corps
      </Module>,
    );
    const region = screen.getByRole("region", { name: "Charge" });
    expect(region).toHaveTextContent("corps");
    expect(region.className).toContain("bg-agon-s1");
    expect(screen.getByRole("button", { name: "Voir" })).toBeInTheDocument();
  });
});

describe("Stat", () => {
  it.each([null, undefined, "", NaN, Infinity])("valeur absente (%s) → « — », sans unité", (v) => {
    render(<Stat value={v} label="FC repos" unit="bpm" />);
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByText("bpm")).toBeNull();
  });

  it("0 est une vraie mesure ; format et unité appliqués", () => {
    const { rerender } = render(<Stat value={0} label="Séances" />);
    expect(screen.getByText("0")).toBeInTheDocument();
    rerender(<Stat value={82.456} label="Poids" unit="kg" format={(v) => v.toFixed(1)} />);
    expect(screen.getByText("82.5")).toBeInTheDocument();
    expect(screen.getByText("kg")).toBeInTheDocument();
    expect(screen.getByText("Poids")).toBeInTheDocument();
  });
});

describe("Tag", () => {
  it("tonalités", () => {
    render(
      <>
        <Tag>Neutre</Tag>
        <Tag tone="succes">Fait</Tag>
      </>,
    );
    expect(screen.getByText("Neutre").className).toContain("bg-agon-s2");
    expect(screen.getByText("Fait").className).toContain("text-agon-succes");
    expect(screen.getByText("Fait").className).toContain("text-agon-xs");
  });
});

describe("EmptyState", () => {
  it("titre, description et action", () => {
    render(<EmptyState title="Aucune séance" description="Rien de prévu" action={<button>Planifier</button>} />);
    expect(screen.getByText("Aucune séance")).toBeInTheDocument();
    expect(screen.getByText("Rien de prévu")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Planifier" })).toBeInTheDocument();
  });
});

describe("Skeleton", () => {
  it("bloc décoratif au fond basalte 2", () => {
    const { container } = render(<Skeleton className="h-4 w-20" />);
    const el = container.firstElementChild!;
    expect(el).toHaveAttribute("aria-hidden", "true");
    expect(el.className).toContain("bg-agon-s2");
    expect(el.className).not.toContain("bg-muted");
  });
});
