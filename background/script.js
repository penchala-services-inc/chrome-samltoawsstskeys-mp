
importScripts(
  "../lib/fxparser.min.js", // https://github.com/NaturalIntelligence/fast-xml-parser
  "../lib/aws-sdk/lib/aws-js-sdk-bundle.js"
)

// Global variables
let CredentialsFilename = 'aws/credentials';
let CredentialsFileContentType = 'selected'
let ConfigFilename = 'aws/config';
let ProfileNamingPattern= 'auto-{accountname}-{accountnumber}-{rolename}';
let ApplySessionDuration = true;
let CustomSessionDuration = 3600;
let DebugLogs = false;
let RoleArns = {};
let FilterRoleArns = {};
let RecentlyLoggedInRoles = {};
let HighlightTermsAndColors =  {
  "production": "red",
  "prod": "red",
  "sandbox": "MediumSeaGreen",
  "beta": "Orange",
  "test": "DodgerBlue",
  "dev": "Gray",
  "np": "Orange",
  "nonprod": "Orange"
};
let ConfigExtraKeys = {};
let LF = '\n';
let storedAccounts = [];
let ExtensionInstalledDate;

// When this background process starts, load variables from chrome storage 
// from saved Extension Options
loadItemsFromStorage();
// Additionaly on start of the background process it is checked if this extension can be activated
chrome.storage.sync.get({
  // The default is activated
  Activated: true
}, function(item) {
  if (item.Activated) addOnBeforeRequestEventListener();
});
// Additionally on start of the background process it is checked if a new version of the plugin is installed.
// If so, show the user the changelog
// var thisVersion = chrome.runtime.getManifest().version;
chrome.runtime.onInstalled.addListener(function(details) {
  if (details.reason == "install" || details.reason == "update") {
    // Open a new tab to show changelog html page
    chrome.tabs.create({ url: "../options/changelog.html" });
    if (details.reason === "install") {
      
      //will use it in sorting
      var currentDateTime = new Date();
      currentDateTime.setSeconds(0, 0); // Remove the seconds and milliseconds from the current date and time
      var dateTime = currentDateTime.toISOString();
      chrome.storage.sync.set({ ExtensionInstalledDate: dateTime });
  }
}
});
// Keep the extensions service worker alive
keepServiceRunning();

// Function to be called when this extension is activated.
// This adds an EventListener for each request to signin.aws.amazon.com
function addOnBeforeRequestEventListener() {
  if (DebugLogs) console.log('DEBUG: Extension is activated');
  if (chrome.webRequest.onBeforeRequest.hasListener(onBeforeRequestEvent)) {
    console.log("ERROR: onBeforeRequest EventListener could not be added, because onBeforeRequest already has an EventListener.");
  } else {
    chrome.webRequest.onBeforeRequest.addListener(
      onBeforeRequestEvent,
      { urls: ["https://signin.aws.amazon.com/saml"] },
      ["requestBody"]
    );
    if (DebugLogs) console.log('DEBUG: onBeforeRequest Listener added');
  }
}

function getAccountNameById(accountId) {
  if (storedAccounts !== null && storedAccounts !== undefined) {
    const account = storedAccounts.find(account => account.accountNumber === accountId);
    return account ? account.accountName : null;
  }
  return null;
}

function getProfileName(attributes_role){
           
      let reRole = /arn:aws:iam:[^:]*:[0-9]+:role\/[^,]+/i;
      let roleArn = attributes_role.match(reRole)[0];

      let regex = /arn:aws:iam::(\d+):role/;
      match = roleArn.match(regex);
      accountNumber = match ? match[1] : '';

      regex = /arn:aws:iam::\d+:role\/(.+)/;
      match = roleArn.match(regex);
      roleName = match ? match[1] : '';

      // Example usage outside of the storage get callback
      const accountName = getAccountNameById(accountNumber);
      if (DebugLogs) {
        console.log('DEBUG: accountName lookup:');
        console.log(accountName);
      }

      let profile_name = ProfileNamingPattern;

      if (accountName !== null && accountName !== undefined && accountName !== '') {
        profile_name = profile_name.replace("{accountname}", accountName);
      } else {
        profile_name = profile_name.replace("{accountname}", accountNumber);
      }
    
      if (profile_name.includes("{accountnumber}")) {
        profile_name = profile_name.replace("{accountnumber}", accountNumber);
      }
    
      if (profile_name.includes("{rolename}")) {
        profile_name = profile_name.replace("{rolename}", roleName);
      }
 

      return profile_name
}

function getExtraConfigKeyValuePairs(){
  
  let extra_config_key_value_pairs= "";
  // If there are extra key values for Config file, add them
  if (Object.keys(ConfigExtraKeys).length > 0) {
    if (DebugLogs) console.log('DEBUG: Additional key values for Config file are configured');
    // Loop through each key (each key has a value)
    let profileList = Object.keys(ConfigExtraKeys);
    for (let i = 0; i < profileList.length; i++) {
      if (DebugLogs) console.log('DEBUG: Config Key -> ' + profileList[i]  + " with Value '" + ConfigExtraKeys[profileList[i]] + "'.");
      try {
        extra_config_key_value_pairs+= profileList[i] + ' = ' + ConfigExtraKeys[profileList[i]]+LF;      
        
      }
      catch(err) {
        console.log("ERROR: Getting extra config key value pairs.");
        console.log(err, err.stack);
      }
    }
  } 
  
  if (DebugLogs) {
    console.log('extra_config_key_value_pairs: ' + extra_config_key_value_pairs);
  }

return extra_config_key_value_pairs;
}

// Function to be called when this extension is de-actived
// by unchecking the activation checkbox on the popup page
function removeOnBeforeRequestEventListener() {
  chrome.webRequest.onBeforeRequest.removeListener(onBeforeRequestEvent);
}
// Callback function for the webRequest OnBeforeRequest EventListener
// This function runs on each request to https://signin.aws.amazon.com/saml
async function onBeforeRequestEvent(details) {
  if (DebugLogs) console.log('DEBUG: onBeforeRequest event hit!');
  // Get the SAML payload
  let samlXmlDoc = "";
  let formDataPayload = undefined;
  // The SAML payload should normally be present as HTTP POST parameter 'SAMLResponse'
  // In reality, since Chrome 62 this broke for certain users. Although not for everyone.
  // As a backup, the raw request body can be used to extract the SAML payload.
  if (details.requestBody.formData) {
    // Decode the base64 encoded SAML payload. This will get us the the SAML payload (which is XML)
    samlXmlDoc = decodeURIComponent(unescape(atob(details.requestBody.formData.SAMLResponse[0])));
  } else if (details.requestBody.raw) {
    let combined = new ArrayBuffer(0);
    details.requestBody.raw.forEach(function(element) {
      let tmp = new Uint8Array(combined.byteLength + element.bytes.byteLength);
      tmp.set(new Uint8Array(combined), 0);
      tmp.set(new Uint8Array(element.bytes), combined.byteLength);
      combined = tmp.buffer;
    });
    let combinedView = new DataView(combined);
    let decoder = new TextDecoder('utf-8');
    formDataPayload = new URLSearchParams(decoder.decode(combinedView));
    // Decode the base64 encoded SAML payload. This will get us the the SAML payload (which is XML)
    samlXmlDoc = decodeURIComponent(unescape(atob(formDataPayload.get('SAMLResponse'))))
  }
  if (DebugLogs) {
    console.log('DEBUG: samlXmlDoc:');
    console.log(samlXmlDoc);
    console.log(details.requestBody.raw);
  }

 

  // Convert XML to JS object
  options = {
    ignoreAttributes: false,
    attributeNamePrefix : "__",
    removeNSPrefix: true,
    alwaysCreateTextNode: true
  };
  parser = new XMLParser(options);
  jsObj = parser.parse(samlXmlDoc);
  console.log("INFO: jsObj")
  console.log(jsObj)
  // Get all attributes from the SAML Assertion
  attributes = jsObj["Response"].Assertion.AttributeStatement.Attribute
  // Loop through attributes to find the required ones
  for (let i in attributes) {
    if (attributes[i].__Name == "https://aws.amazon.com/SAML/Attributes/Role") {
      attributes_role_list = attributes[i].AttributeValue
      if (DebugLogs) {
        console.log('DEBUG: attributes_role_list:');
        console.log(attributes_role_list);
      }
    }
    if (attributes[i].__Name == "https://aws.amazon.com/SAML/Attributes/SessionDuration") {
      sessionduration = attributes[i].AttributeValue['#text']
      if (DebugLogs) {
        console.log('DEBUG: sessionduration:');
        console.log(sessionduration);
      }
    }
  }

  // Get the base64 encoded SAML Response from the IDP
  // and check if user provided a choice (roleIndex) for any of the roles
  let SAMLAssertion = undefined;
  let hasRoleIndex = false;
  let roleIndex = undefined;
  if (details.requestBody.formData) {
    SAMLAssertion = details.requestBody.formData.SAMLResponse[0];
    if ("roleIndex" in details.requestBody.formData) {
      hasRoleIndex = true;
      roleIndex = details.requestBody.formData.roleIndex[0];
    }
  } else if (formDataPayload) {
    SAMLAssertion = formDataPayload.get('SAMLResponse');
    roleIndex = formDataPayload.get('roleIndex');
    hasRoleIndex = roleIndex != undefined;
  }

  // Set the session duration to the value of CustomSessionDuration if:
  // * session duration was not supplied in the SAML assertion
  // * user configured to NOT use the session duration supplied in the SAML assertion
  if (typeof sessionduration === 'undefined' || !ApplySessionDuration) {
    sessionduration = CustomSessionDuration
  }

  // Change newline sequence when client is on Windows
  if (navigator.userAgent.indexOf('Windows') !== -1) {
    LF = '\r\n'
  }

  if (DebugLogs) {
    console.log('ApplySessionDuration: ' + ApplySessionDuration);
    console.log('SessionDuration: ' + sessionduration);
    console.log('hasRoleIndex: ' + hasRoleIndex);
    console.log('roleIndex: ' + roleIndex);
    console.log('SAMLAssertion: ' + SAMLAssertion);
  }

    // Read data from Chrome extension storage
    chrome.storage.sync.get('accounts', function(result) {
    storedAccounts = result.accounts || [];
    // Additional code that depends on the retrieved accounts can be placed here
  });

  let fileContentObject = {configs:"",credentials:""};


  let attributes_role;
  let profile_name ="";
  //for non defaults this is going to be null, for defaults it is going to be accountname_role and primary is default
  let secondary_profile_name ="";
  let extra_config_key_value_pairs = getExtraConfigKeyValuePairs();

  if (DebugLogs) {
    console.log('DEBUG: :CredentialsFileContentType');
    console.log(CredentialsFileContentType);
  }
  
   // If there is more than 1 role in the claim and roleIndex is set (hasRoleIndex = 'true'), then 
  // roleIndex should match with one of the items in attributes_role_list (the claimed roles).
  // This is the role which will be assumed.
  if (attributes_role_list.length > 1 && hasRoleIndex) {
    if (DebugLogs) console.log('DEBUG: More than one role claimed and role chosen.');
    console.log('attributes_role_list.length')
    console.log(attributes_role_list.length)

    for (i = 0; i < attributes_role_list.length; i++) { 
      // This item holdes the data for the role to assume.
        // (i.e. the ARN for the IAM role and the ARN of the saml-provider resource)
        attributes_role = attributes_role_list[i]['#text']

      // roleIndex is an AWS IAM Role ARN. 
      // We need to check which item in attributes_role_list matches with roleIndex as substring
      if (attributes_role_list[i]['#text'].indexOf(roleIndex) > -1) {
        
        profile_name = "default";
        //also saving the profile with accountname_role name along with default
        secondary_profile_name = getProfileName(attributes_role)    

        await addProfileToCredentialsandConfigs(attributes_role,profile_name,SAMLAssertion,sessionduration,extra_config_key_value_pairs,fileContentObject,secondary_profile_name);

        if(CredentialsFileContentType=="selected")
          break;

      }
      else{

        let reRole = /arn:aws:iam:[^:]*:[0-9]+:role\/[^,]+/i;
        // Extract both regex patterns from the roleClaimValue (which is a SAMLAssertion attribute)
        let RoleArn = attributes_role.match(reRole)[0];
        profile_name = getProfileName(attributes_role)    

        if(CredentialsFileContentType=="all")
        {
          
          await addProfileToCredentialsandConfigs(attributes_role,profile_name,SAMLAssertion,sessionduration,extra_config_key_value_pairs,fileContentObject);
        }
        else if(CredentialsFileContentType == "custom"){
          // If there are Role ARNs configured in the options panel for filtering, only save keys for them
          if (Object.keys(FilterRoleArns).length > 0) {
            if (DebugLogs) console.log('DEBUG: Role ARNs are configured for filtering');

            // Loop through each role arn
            let profileList = Object.keys(FilterRoleArns);
            for (let i = 0; i < profileList.length; i++) {
              console.log(RoleArn)
              if(RoleArn==FilterRoleArns[profileList[i]]){
                if (DebugLogs){
                  console.log('DEBUG: Role matched with user entered role arn in options page.');
                  console.log(FilterRoleArns[profileList[i]]);                
                }
                
                await addProfileToCredentialsandConfigs(attributes_role,profile_name,SAMLAssertion,sessionduration,extra_config_key_value_pairs,fileContentObject);
                break;
              }
              
              
            }
          }
        } 
        else if(CredentialsFileContentType == "recent"){
          // If there are Role ARNs configured in the options panel for filtering, only save keys for them
          if (Object.keys(RecentlyLoggedInRoles).length > 0) {
            if (DebugLogs) console.log('DEBUG: Recently Logged In Roles found in storage.');
  
            // Loop through the roles in reverse order,no reason, some copied code
            for (var j = 0; j<=RecentlyLoggedInRoles.length -1 ; j++) {
              var role = RecentlyLoggedInRoles[j];
              var savedRole = role.id;

              if(RoleArn==savedRole){
                if (DebugLogs){
                  console.log('DEBUG: Saved Role matched with a role in the login page.');
                  console.log(savedRole);                
                }

                await addProfileToCredentialsandConfigs(attributes_role,profile_name,SAMLAssertion,sessionduration,extra_config_key_value_pairs,fileContentObject);
                break;
              }

              if(j==5){
                break;
              }

            }

          }
        } 
      }
      
       }           
    }
  
  
  // If there is just 1 role in the claim there will be no 'roleIndex' in the form data.
  // If there is just one role, the XMLParser does not create a list
  else if (attributes_role_list.hasOwnProperty('#text')) {
    // This item holdes the data for the role to assume.
    // (i.e. the ARN for the IAM role and the ARN of the saml-provider resource)
    // Use "['#text']" selector, because with one role its not a list and we simply need the value
    attributes_role = attributes_role_list['#text']
    profile_name = "default";
    secondary_profile_name = getProfileName(attributes_role)    

    await addProfileToCredentialsandConfigs(attributes_role,profile_name,SAMLAssertion,sessionduration,extra_config_key_value_pairs,fileContentObject,secondary_profile_name);
    
  }
  else {
    if (DebugLogs) console.log('DEBUG: Not known which role to assume.');
    return; // No need to proceed any further
  }
  if (DebugLogs) {
    console.log('DEBUG: attributes_role:');
    console.log(attributes_role);
  }
  
  //TODO Refactor to avoid duplication
  let keys; // To store the AWS access and access secret key 
  let credentials = ""; // Store all the content that needs to be written to the credentials file
  // Call AWS STS API to get credentials using the SAML Assertion
  try {
    keys = await assumeRoleWithSAML(attributes_role, SAMLAssertion, sessionduration);
  
  }
  catch(err) {
    console.log("ERROR: Error when trying to assume the IAM Role with the SAML Assertion.");
    console.log(err, err.stack);
    return;
  }
  // If there are extra Role ARNs configured in the options panel
  // then assume each role to get credentials keys for each.
  if (Object.keys(RoleArns).length > 0) {
    if (DebugLogs) console.log('DEBUG: Additional Role ARNs are configured');
    // Loop through each profile (each profile has a role ARN as value)
    let profileList = Object.keys(RoleArns);
    for (let i = 0; i < profileList.length; i++) {
      console.log('INFO: Do additional assume-role for role -> ' + RoleArns[profileList[i]] + 
      " with profile name '" + profileList[i] + "'.");
      // Call AWS STS API to get credentials using Access Key ID and Secret Access Key as authentication
      try {
        let result = await assumeRole(RoleArns[profileList[i]], profileList[i], keys.access_key_id,
          keys.secret_access_key, keys.session_token, sessionduration);
        // Append AWS credentials keys as string to 'credentials' variable
        fileContentObject.credentials = addProfileToCredentials(fileContentObject.credentials, profileList[i], result.access_key_id,
          result.secret_access_key, result.session_token);
        
        fileContentObject.configs = addProfileToConfigs(fileContentObject.configs, profileList[i], extra_config_key_value_pairs)
      }
      catch(err) {
        console.log("ERROR: Error when trying to assume additional IAM Role.");
        console.log(err, err.stack);
      }
    }
  } 

  // Write credentials to file
  console.log('Generate AWS tokens/credentials file.');
  outputCredentialsDocAsDownload(fileContentObject);

    // Write credentials to file
    console.log('Generate Config file.');
    outputConfigsDocAsDownload(fileContentObject);
  
  
}

async function addProfileToCredentialsandConfigs(attributes_role,profile_name,SAMLAssertion,sessionduration,extra_config_key_value_pairs,fileContentObject,secondary_profile_name=""){
  let keys; // To store the AWS access and access secret key 

  // Call AWS STS API to get credentials using the SAML Assertion
 try {
  keys = await assumeRoleWithSAML(attributes_role, SAMLAssertion, sessionduration);
  // Append AWS credentials keys as string to 'credentials' variable
  fileContentObject.credentials = addProfileToCredentials(fileContentObject.credentials, profile_name, keys.access_key_id, 
    keys.secret_access_key, keys.session_token)
  
  //for selected role saving it as default, also as accountname_role format.
  if(profile_name == "default"){
    fileContentObject.credentials = addProfileToCredentials(fileContentObject.credentials, secondary_profile_name, keys.access_key_id, 
      keys.secret_access_key, keys.session_token)
  }

}
catch(err) {
  console.log("ERROR: Error when trying to assume the IAM Role with the SAML Assertion.");
  console.log(err, err.stack);
}
  
  try {
    // Append profile to 'configs' variable along with extra keys user defined
    fileContentObject.configs = addProfileToConfigs(fileContentObject.configs, profile_name, extra_config_key_value_pairs)
    
    //for selected role saving it as default, also as accountname_role format.
    if(profile_name == "default"){
      fileContentObject.configs = addProfileToConfigs(fileContentObject.configs, secondary_profile_name, extra_config_key_value_pairs)
    }
  }
  catch(err) {
    console.log("ERROR: Error when trying append configs with profile.");
    console.log(err, err.stack);
  }
}

// Called from 'onBeforeRequestEvent' function.
// Gets a Role Attribute from a SAMLAssertion as function argument. Gets the SAMLAssertion as a second argument.
// This function extracts the RoleArn and PrincipalArn (SAML-provider)
// from this argument and uses it to call the AWS STS assumeRoleWithSAML API.
// Takes the SAMLAssertion as a second argument which is needed as authentication for the STS API.
async function assumeRoleWithSAML(roleClaimValue, SAMLAssertion, SessionDuration) {
  // Pattern for Role
  let reRole = /arn:aws:iam:[^:]*:[0-9]+:role\/[^,]+/i;
  // Patern for Principal (SAML Provider)
  let rePrincipal = /arn:aws:iam:[^:]*:[0-9]+:saml-provider\/[^,]+/i;
  // Extract both regex patterns from the roleClaimValue (which is a SAMLAssertion attribute)
  RoleArn = roleClaimValue.match(reRole)[0];
  PrincipalArn = roleClaimValue.match(rePrincipal)[0];
  
  if (DebugLogs) {
    console.log('RoleArn: ' + RoleArn);
    console.log('PrincipalArn: ' + PrincipalArn);
  }

  // Set parameters needed for AWS STS assumeRoleWithSAML API method
  let params = {
    PrincipalArn: PrincipalArn,
    RoleArn: RoleArn,
    SAMLAssertion: SAMLAssertion
  };
  if (SessionDuration !== null) {
    params['DurationSeconds'] = SessionDuration;
  }

  // AWS SDK is a module exorted from a webpack packaged lib
  // See 'library.name' in webpack.config.js
  let clientconfig = {
    region: 'us-east-1', // region is mandatory to specify, but ignored when using global endpoint
    useGlobalEndpoint: true
  }
  const client = new webpacksts.AWSSTSClient(clientconfig);
  const command = new webpacksts.AWSAssumeRoleWithSAMLCommand(params);

  console.log("INFO: AWSAssumeRoleWithSAMLCommand client.send will now be executed")
  try {
    const response = await client.send(command);
    console.log("INFO: AWSAssumeRoleWithSAMLCommand client.send is done!")
    let keys = {
      access_key_id: response.Credentials.AccessKeyId,
      secret_access_key: response.Credentials.SecretAccessKey,
      session_token: response.Credentials.SessionToken,
    }
    if (DebugLogs) {
      console.log('DEBUG: AssumeRoleWithSAML response:');
      console.log(keys);
    }
    return keys;
  }
  catch (error) {
   // Retry SessionDuration errors 
   if(SessionDuration !== null && error.message.includes("The requested DurationSeconds exceeds the MaxSessionDuration"))
   {
     console.warn(`The requested SessionDuration ${SessionDuration} exceeds the MaxSessionDuration. Retrying request without duration.`)
     keys = await assumeRoleWithSAML(roleClaimValue, SAMLAssertion, null);
     return keys;
   }
   else {
     console.log(error)
   }
  }
} // End of assumeRoleWithSAML function


// Will fetch additional AWS credentials keys for 1 role
// The assume-role API is called using the earlier fetched AWS credentials keys
// (which where fetched using SAML) as authentication.
async function assumeRole(roleArn, roleSessionName, AccessKeyId, SecretAccessKey,
  SessionToken, SessionDuration) {
  // Set the fetched STS keys from the SAML response as credentials for doing the API call
  let clientconfig = {
    region: 'us-east-1', // region is mandatory to specify, but ignored when using global endpoint
    useGlobalEndpoint: true,
    credentials: {
      accessKeyId: AccessKeyId, secretAccessKey: SecretAccessKey, sessionToken: SessionToken
    }
  }
  // AWS SDK is a module exorted from a webpack packaged lib
  // See 'library.name' in webpack.config.js
  const client = new webpacksts.AWSSTSClient(clientconfig);
  // Set the parameters for the AssumeRole API call. Meaning: What role to assume
  let params = {
    RoleArn: roleArn,
    RoleSessionName: roleSessionName
  };
  if (SessionDuration !== null) {
    params['DurationSeconds'] = SessionDuration;
  }
  const command = new webpacksts.AWSAssumeRoleCommand(params);

  console.log("INFO: assumeRole client.send will now be executed")
  try {
    const response = await client.send(command);
    console.log("INFO: assumeRole client.send is done!")
    let keys = {
      access_key_id: response.Credentials.AccessKeyId,
      secret_access_key: response.Credentials.SecretAccessKey,
      session_token: response.Credentials.SessionToken,
    }
    if (DebugLogs) {
      console.log('DEBUG: assumeRole response:');
      console.log(keys);
    }
    return keys
  }
  catch (error) {
    console.log(error)
  }
}

// Append AWS credentials profile to the existing content of a credentials file
function addProfileToCredentials(credentials, profileName, AccessKeyId, SecretAcessKey, SessionToken) {
  credentials += "[" + profileName + "]" + LF +
  "aws_access_key_id=" + AccessKeyId + LF +
  "aws_secret_access_key=" + SecretAcessKey + LF +
  "aws_session_token=" + SessionToken + LF +
  LF;
  return credentials;
}
// Append AWS credentials profile to the existing content of a credentials file
function addProfileToConfigs(configs, profileName, ExtraConfigKeys) {
  configs += "[profile " + profileName + "]" + LF +
    ExtraConfigKeys + LF +
  LF;
  return configs;
}
// Takes the content of an AWS SDK 'credentials' file as argument and will
// initiate a download in Chrome. 
// It should be saved to Chrome's Download directory automatically.
function outputCredentialsDocAsDownload(fileContentObject) {
  if (DebugLogs) {
    console.log('DEBUG: Now going to download credentials file. Document content:');
    console.log(fileContentObject.credentials);
    console.log('DEBUG: Saving credential file to:');
    console.log(CredentialsFilename);
  }
  // Triggers download of the generated file
  chrome.downloads.download({ 
    url: 'data:text/plain,' + encodeURIComponent(fileContentObject.credentials), 
    filename: CredentialsFilename, 
    conflictAction: 'overwrite',
    saveAs: false
    
  });
}

// Takes the content of 'config' file as argument and will
// initiate a download in Chrome. 
// It should be saved to Chrome's Download directory automatically.
function outputConfigsDocAsDownload(fileContentObject) {
  if (DebugLogs) {
    console.log('DEBUG: Now going to download config file. Document content:');
    console.log(fileContentObject.configs);
    console.log('DEBUG: Saving config file to:');
    console.log(ConfigFilename);
  }
  // Triggers download of the generated file
  chrome.downloads.download({ 
    url: 'data:text/plain,' + encodeURIComponent(fileContentObject.configs), 
    filename: ConfigFilename, 
    conflictAction: 'overwrite',
    saveAs: false
    
  });
}

// This Listener receives messages from options.js and popup.js
// Received messages are meant to affect the background process.
chrome.runtime.onMessage.addListener(
  function (request, sender, sendResponse) {
    // When the options are changed in the Options panel
    // these items need to be reloaded in this background process.
    if (request.action == "reloadStorageItems") {
      loadItemsFromStorage();
      sendResponse({ message: "Storage items reloaded in background process." });
    }
    // When the activation checkbox on the popup screen is checked/unchecked
    // the webRequest event listener needs to be added or removed.
    if (request.action == "addWebRequestEventListener") {
      if (DebugLogs) console.log('DEBUG: Extension enabled from popup');
      addOnBeforeRequestEventListener();
      sendResponse({ message: "webRequest EventListener added in background process." });
    }
    if (request.action == "removeWebRequestEventListener") {
      if (DebugLogs) console.log('DEBUG: Extension disabled from popup');
      removeOnBeforeRequestEventListener();
      sendResponse({ message: "webRequest EventListener removed in background process." });
    }
  });

function keepServiceRunning() {
    // Call this function every 20 seconds to keep service worker alive
    if (DebugLogs) console.log('DEBUG: keepServiceRunning triggered');
    setTimeout(keepServiceRunning, 20000);
}

function loadItemsFromStorage() {
  //default values for the options
  chrome.storage.sync.get({
    CredentialsFilename: 'aws/credentials',
    CredentialsFileContentType : 'selected',
    ConfigFilename: 'aws/config',
    ProfileNamingPattern: 'auto-{accountname}-{accountnumber}-{rolename}',
    ApplySessionDuration: 'yes',
    CustomSessionDuration: '3600',
    DebugLogs: 'no',
    RoleArns: {},
    FilterRoleArns: {},
    RecentlyLoggedInRoles : {},
    HighlightTermsAndColors :  {
      "production": "red",
      "prod": "red",
      "sandbox": "MediumSeaGreen",
      "beta": "Orange",
      "np": "Orange",
      "test": "DodgerBlue",
      "dev": "Gray",
      "nonprod": "Orange"
    },
    ConfigExtraKeys: {}
  }, function (items) {
    CredentialsFilename = items.CredentialsFilename;
    CredentialsFileContentType = items.CredentialsFileContentType;
    ConfigFilename = items.ConfigFilename;
    ProfileNamingPattern: items.ProfileNamingPattern;
    CustomSessionDuration = items.CustomSessionDuration;
    storedAccounts = items.accounts;
    if (items.ApplySessionDuration == "no") {
      ApplySessionDuration = false;
    } else {
      ApplySessionDuration = true;
    }
    if (items.DebugLogs == "no") {
      DebugLogs = false;
    } else {
      DebugLogs = true;
    }
    RoleArns = items.RoleArns;
    FilterRoleArns = items.FilterRoleArns;
    ConfigExtraKeys = items.ConfigExtraKeys;
    HighlightTermsAndColors = items.HighlightTermsAndColors;
    RecentlyLoggedInRoles = items.RecentlyLoggedInRoles;

  });
}
