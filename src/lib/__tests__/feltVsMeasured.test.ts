import { describe, expect, it } from "vitest";
import { agreement } from "../feltVsMeasured";

describe("agreement", () => {
  it("se sent bien mais mesure nettement sous la moyenne : écart", () => {
    expect(agreement(4, 52, 78, true)).toBe("ecart");
  });
  it("se sent bien et mesure normale : cohérent", () => {
    expect(agreement(4, 75, 78, true)).toBe("coherent");
  });
  it("stress : plus bas = mieux", () => {
    // se dit détendu (4) mais stress mesuré bien au-dessus de l'habitude
    expect(agreement(4, 40, 29, false)).toBe("ecart");
    expect(agreement(3, 31, 29, false)).toBe("coherent");
  });
  it("se sent mal alors que la mesure est meilleure que d'habitude : écart", () => {
    expect(agreement(2, 85, 78, true)).toBe("ecart");
  });
  it("pas de moyenne : cohérent par défaut", () => {
    expect(agreement(5, 10, 0, true)).toBe("coherent");
  });
});
