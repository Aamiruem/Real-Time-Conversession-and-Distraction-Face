"""Account settings: display name, password and deleting the account with all its data."""
import streamlit as st

from utils import api_client as api
from utils.ui import logout, page_header, require_login, setup

setup("Account settings", "⚙️")
require_login()
user = st.session_state["user"]

page_header("⚙️ Account settings", f"@{user['username']} · {user['email']}", eyebrow="Account", highlight="settings")

with st.form("profile"):
    st.subheader("👤 Profile")
    name = st.text_input("Display name", value=user.get("full_name") or "", max_chars=100)
    if st.form_submit_button("Save", type="primary"):
        try:
            st.session_state["user"] = api.update_profile(name)
            st.success("Profile saved.")
        except api.APIError as e:
            st.error(str(e))

with st.form("password", clear_on_submit=True):
    st.subheader("🔑 Password")
    a, b = st.columns(2)
    current = a.text_input("Current password", type="password")
    new = b.text_input("New password", type="password", help="At least 8 characters with letters and numbers")
    if st.form_submit_button("Change password"):
        try:
            st.success(api.change_password(current, new)["message"])
        except api.APIError as e:
            st.error(str(e))

with st.form("delete"):
    st.subheader("🗑️ Delete account")
    st.caption("Permanently deletes your focus sessions, recordings' results, interview answers, chat messages and the "
               "rooms you created. This can't be undone.")
    password = st.text_input("Your password", type="password", key="delete_pw")
    sure = st.checkbox("I understand this permanently deletes my data")
    if st.form_submit_button("Delete my account", disabled=False):
        if not sure:
            st.warning("Tick the box to confirm.")
        else:
            try:
                api.delete_account(password)
                logout()
            except api.APIError as e:
                st.error(str(e))
