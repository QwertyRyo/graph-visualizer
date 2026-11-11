import { useNavigate } from "react-router";
import { authErrorMessage, signOut, useAuth } from "../data/auth";
import { showAlert } from "../editor/dialog/alertStore";
import { Menu } from "../editor/layout/Menu";
import { openAuthDialog } from "./authDialogStore";

const headerButton =
  "border border-ink bg-white px-3 py-1 text-sm shadow-[2px_2px_0_0_var(--color-ink)] hover:bg-accent-soft active:translate-x-0.5 active:translate-y-0.5 active:shadow-none";

export function AccountButton() {
  const { user, ready } = useAuth();
  const navigate = useNavigate();

  if (!ready) return null;

  if (!user) {
    return (
      <button type="button" onClick={() => openAuthDialog("signIn")} className={headerButton}>
        Sign in
      </button>
    );
  }

  const name = user.displayName || user.email || "Account";

  return (
    <Menu
      label={name}
      title={user.email ?? undefined}
      buttonClassName={`${headerButton} max-w-56 truncate`}
      items={[
        { id: "graphs", label: "My graphs" },
        { id: "signOut", label: "Sign out" },
      ]}
      onSelect={(id) => {
        if (id === "graphs") navigate("/graphs");
        else signOut().catch((err) => showAlert("Couldn't sign out", authErrorMessage(err)));
      }}
    />
  );
}
