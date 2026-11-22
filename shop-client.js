const projectUrl = 'https://ozgpmnmmaxwuyedioetw.supabase.co';
const publishableKey = 'sb_publishable_hEIsnV1e2CYehJ11flIawQ_HD_EnYEL';
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.87.1/+esm';
export const client = createClient(projectUrl, publishableKey, { auth: { flowType: 'implicit' } });
