import { useState, useEffect } from "react";
import { getProfile, subscribeToProfile } from "../lib/userService";

/**
 * Hook to fetch and subscribe to a user's profile
 */
export function useProfile(address) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!address) {
      console.log("useProfile: no address provided");
      setProfile(null);
      setLoading(false);
      return;
    }

    let mounted = true;
    console.log("useProfile: starting fetch for", address.slice(0, 8));

    const loadProfile = async () => {
      setLoading(true);
      try {
        const data = await getProfile(address);
        console.log("useProfile: loaded profile for", address.slice(0, 8), ":", data);
        if (mounted) {
          setProfile(data);
          setLoading(false);
        }
      } catch (err) {
        console.error("useProfile: error loading profile", err);
        if (mounted) {
          setLoading(false);
        }
      }
    };

    loadProfile();

    const unsub = subscribeToProfile(address, (newProfile) => {
      console.log("useProfile: subscription update for", address.slice(0, 8), ":", newProfile);
      if (mounted) {
        setProfile(newProfile);
      }
    });

    return () => {
      mounted = false;
      unsub();
    };
  }, [address]);

  return { profile, loading };
}

/**
 * Hook to get display name for an address
 * Returns username if available, otherwise shortened address
 */
export function useDisplayName(address) {
  const { profile, loading } = useProfile(address);
  
  if (!address) return { name: "Unknown", loading: false };
  
  const name = profile?.username || `${address.slice(0, 6)}...${address.slice(-4)}`;
  
  return { name, loading };
}

export default useProfile;
