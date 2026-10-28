// Small router hooks on top of React Router, so pages read like plain React: router.push / replace, pathname, query.
import { useMemo } from "react";
import { useLocation, useNavigate, useSearchParams as useQuery } from "react-router";

export function useRouter() {
  const navigate = useNavigate();
  return useMemo(
    () => ({
      push: (to) => navigate(to),
      replace: (to) => navigate(to, { replace: true }),
      back: () => navigate(-1),
    }),
    [navigate],
  );
}

export const usePathname = () => useLocation().pathname;

/** URLSearchParams of the current location (read-only). */
export const useSearchParams = () => useQuery()[0];
