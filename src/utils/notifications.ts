import { createDiscreteApi } from "naive-ui";

// Crear una API discreta para usar fuera de componentes Vue
const { message } = createDiscreteApi(["message"]);

export { message };
