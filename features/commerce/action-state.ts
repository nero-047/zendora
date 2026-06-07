export type ActionState = {
  status: "idle" | "success" | "error";
  message: string;
  errors?: Record<string, string[] | undefined>;
  data?: Record<string, string | number | boolean | null | undefined>;
};

export const initialActionState: ActionState = {
  status: "idle",
  message: "",
};
