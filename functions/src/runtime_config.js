'use strict';
// Deployment metadata only, never a private key or Google ADC credential.
function runtimeOptions(account,project) {
  if(!account)return {};
  if(typeof account!=='string')throw Error('invalid_runtime_service_account');
  const match=/^[a-z][a-z0-9-]{4,28}[a-z0-9]@([a-z][a-z0-9-]{4,28}[a-z0-9])\.iam\.gserviceaccount\.com$/.exec(account);
  if(!match||(project&&match[1]!==project))throw Error('invalid_runtime_service_account');
  return {serviceAccount:account};
}
module.exports={runtimeOptions};
