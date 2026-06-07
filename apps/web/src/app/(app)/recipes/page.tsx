import { redirect } from "next/navigation";

export default function RecipesPage() {
  redirect("/products?message=Recipes%20have%20moved%20under%20Products%20%E2%86%92%20Components");
}
