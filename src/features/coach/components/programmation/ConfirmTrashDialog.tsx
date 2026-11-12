import { Button } from "@/ui/Button";
import { Dialog } from "@/ui/Dialog";

interface Props {
  sessionName: string;
  onConfirm: () => void;
  onClose: () => void;
}

/** Confirmation avant de mettre une séance à la corbeille. */
export function ConfirmTrashDialog({ sessionName, onConfirm, onClose }: Props) {
  return (
    <Dialog
      open
      onOpenChange={(o) => { if (!o) onClose(); }}
      title="Déplacer vers la corbeille ?"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Annuler</Button>
          <Button className="bg-agon-erreur-vif text-agon-ink" onClick={onConfirm}>Supprimer</Button>
        </>
      }
    >
      <p className="text-agon-base text-agon-tx2">
        <span className="font-bold">"{sessionName}"</span> sera déplacée dans la corbeille. Tu pourras la restaurer.
      </p>
    </Dialog>
  );
}
