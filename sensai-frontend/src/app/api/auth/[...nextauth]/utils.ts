/**
 * Server-side utility functions for authentication
 */

interface UserData {
  email: string;
  given_name?: string;
  family_name?: string;
  name?: string;
  image?: string;
  id?: string;
}

interface AccountData {
  access_token?: string;
  id_token?: string;
  provider?: string;
}

/**
 * Send user authentication data to the backend after successful Google login
 * This is a server-side implementation for NextAuth callbacks
 */
export async function registerUserWithBackend(
  user: UserData,
  account: AccountData
): Promise<any> {

  // #region agent log
  fetch('http://127.0.0.1:7640/ingest/9e632542-188e-41e8-8c19-5fd95ba4a1eb',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'1ee9a9'},body:JSON.stringify({sessionId:'1ee9a9',location:'utils.ts:29',message:'registerUserWithBackend called',data:{email:user.email,hasIdToken:!!account.id_token,idTokenLength:account.id_token?.length,idTokenPrefix:account.id_token?.substring(0,20),hasAccessToken:!!account.access_token,provider:account.provider,backendUrl:process.env.BACKEND_URL},timestamp:Date.now(),hypothesisId:'A-B'})}).catch(()=>{});
  // #endregion

  const requestBody = {
    email: user.email,
    given_name: user.given_name || user.name?.split(' ')[0] || '',
    family_name: user.family_name || user.name?.split(' ').slice(1).join(' ') || '',
    id_token: account.id_token
  };

  const response = await fetch(`${process.env.BACKEND_URL}/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  // #region agent log
  let responseBody: any = null;
  try { responseBody = await response.clone().json(); } catch {}
  fetch('http://127.0.0.1:7640/ingest/9e632542-188e-41e8-8c19-5fd95ba4a1eb',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'1ee9a9'},body:JSON.stringify({sessionId:'1ee9a9',location:'utils.ts:48',message:'backend response received',data:{status:response.status,ok:response.ok,responseBody},timestamp:Date.now(),hypothesisId:'A-B-C-D'})}).catch(()=>{});
  // #endregion

  if (!response.ok) {
    throw new Error(`Backend auth failed: ${response.status}`);
  }

  // Return the raw response data - assuming it contains an 'id' field directly
  const data = await response.json();
  
  // Make sure the ID exists and is returned properly
  if (!data.id) {
    console.error("Backend response missing ID field:", data);
  }
  
  return data;
} 