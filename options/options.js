// Saves options to chrome.storage
function save_options() {
  // Get the credentials filename to be saved
  var CredentialsFilename = document.getElementById('CredentialsFilename').value;

  // Get what to save save in credentials file
  var CredentialsFileContentType = $("input[name='credentials-content-option']:checked").val();

  // Get the config filename to be saved
  var ConfigFilename = document.getElementById('ConfigFilename').value;

  // Get the ProfileNamingPattern to be saved
  var ProfileNamingPattern = document.getElementById('ProfileNamingPattern').value;

  // Does SessionDuration needs to be applied?
  var ApplySessionDuration = $("#SessionDuration option:selected").val();

  // How log should the session be valid?
  var CustomSessionDuration = document.getElementById('CustomSessionDuration').value

  // Is DEBUG log enabled?
  var DebugLogs = $("#DebugLogs option:selected").val();

  // Get the Role_ARN's (Profile/ARNs pairs) entered by the user in the table
  var RoleArns = {};
  // Iterate over all added profiles in the list
  $("#role_arns").find("input[id^='key_']").each(function (index) {
    // Replace profile_<rowId> for arn_<rowId> to be able to get value of corresponding arn input field
    var input_id_value = $(this).attr('id').replace("key", "value");
    // Create key-value pair to add to RoleArns dictionary.
    // Only add it to the dict if both profile and arn are not an empty string
    if ($(this).val() != '' && $('#' + input_id_value).val() != '') {
      RoleArns[$(this).val()] = $('#' + input_id_value).val();
    }
  });

    // Get the Role_ARN's (Profile/ARNs pairs) entered by the user in the table
    var FilterRoleArns = {};
    // Iterate over all added profiles in the list
    $("#filter_role_arns").find("input[id^='key_']").each(function (index) {
      // Replace profile_<rowId> for arn_<rowId> to be able to get value of corresponding arn input field
      var input_id_value = $(this).attr('id').replace("key", "value");
      // Create key-value pair to add to FilterRoleArns dictionary.
      // Only add it to the dict if both profile and arn are not an empty string
      if ($(this).val() != '' && $('#' + input_id_value).val() != '') {
        FilterRoleArns[$(this).val()] = $('#' + input_id_value).val();
      }
    });

   // Get the ConfigExtraKeys (Key/Value pairs) entered by the user in the table
   var ConfigExtraKeys = {};
   // Iterate over all added key value pairs in the list
   $("#configs_extra_key_value_pairs").find("input[id^='key_']").each(function (index) {
     // Replace profile_<rowId> for arn_<rowId> to be able to get value of corresponding arn input field
     var input_id_value = $(this).attr('id').replace("key", "value");
     // Create key-value pair to add to ConfigExtraKeys dictionary.
     // Only add it to the dict if both profile and arn are not an empty string
     if ($(this).val() != '' && $('#' + input_id_value).val() != '') {
      ConfigExtraKeys[$(this).val()] = $('#' + input_id_value).val();
     }
   });

    // Get the Highlight term and color pairs) entered by the user in the table
    var HighlightTermsAndColors = {};
    // Iterate over all added profiles in the list
    $("#highlight_term_and_colors").find("input[id^='key_']").each(function (index) {
      // Replace profile_<rowId> for arn_<rowId> to be able to get value of corresponding arn input field
      var input_id_value = $(this).attr('id').replace("key", "value");
      // Create key-value pair to add to HighlightTermsAndColors dictionary.
      // Only add it to the dict if both profile and arn are not an empty string
      if ($(this).val() != '' && $('#' + input_id_value).val() != '') {
        HighlightTermsAndColors[$(this).val()] = $('#' + input_id_value).val();
      }
    });

  // Save into Chrome storage
  chrome.storage.sync.set({
    CredentialsFilename: CredentialsFilename,
    CredentialsFileContentType:CredentialsFileContentType,
    ConfigFilename: ConfigFilename,
    ProfileNamingPattern : ProfileNamingPattern,
    ApplySessionDuration: ApplySessionDuration,
    CustomSessionDuration: CustomSessionDuration,
    DebugLogs: DebugLogs,
    RoleArns: RoleArns,
    HighlightTermsAndColors:HighlightTermsAndColors,
    FilterRoleArns: FilterRoleArns,
    ConfigExtraKeys: ConfigExtraKeys
  }, function () {
    // Show 'Options saved' message to let user know options were saved.
    var status = document.getElementById('status');
    status.textContent = 'Options saved.';
    setTimeout(function () {
      status.textContent = '';
    }, 1500);
  });

  // Notify background process of changed storage items.
  chrome.runtime.sendMessage({ action: "reloadStorageItems" }, function (response) {
    console.log(response.message);
  });
}

// Restores state using the preferences stored in chrome.storage.
function restore_options() {
  chrome.storage.sync.get({
    // Default values
    CredentialsFilename: 'aws/credentials',
    CredentialsFileContentType: 'selected',
    ConfigFilename: 'aws/config',
    ProfileNamingPattern: 'auto-{accountname}-{accountnumber}-{rolename}',
    ApplySessionDuration: 'yes',
    CustomSessionDuration: '3600',
    DebugLogs: 'no',
    RoleArns: {},
    FilterRoleArns: {},
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
    // Set credentials filename
    document.getElementById('CredentialsFilename').value = items.CredentialsFilename;

    //Set Credential File Content Type
    $("input[name='credentials-content-option'][value='" + items.CredentialsFileContentType + "']").prop("checked", true);    

    // Set config filename
    document.getElementById('ConfigFilename').value = items.ConfigFilename;

  // Set profile naming pattern
  document.getElementById('ProfileNamingPattern').value = items.ProfileNamingPattern;

    // Set CustomSessionDuration
    document.getElementById('CustomSessionDuration').value = items.CustomSessionDuration;
    // Set ApplySessionDuration
    $("#SessionDuration").val(items.ApplySessionDuration);
    // Set DebugLogs
    $("#DebugLogs").val(items.DebugLogs);  

    console.log(items.FilterRoleArns)
    console.log(items.HighlightTermsAndColors)

    $("#highlight_term_and_colors").html('<table><tr id="tr_header"><th>Term in Account Name</th><th>Color</th><th></th><th></th></tr></table>');
    // For each profile/ARN pair add table row (showing the profile-name and ARN)
    for (var profile in items.HighlightTermsAndColors) {
      if (items.HighlightTermsAndColors.hasOwnProperty(profile)) {
        addTableRow('#tr_header', profile, items.HighlightTermsAndColors[profile]);
      }
    }
    // Add a blank table row if there are now current entries (So the user can easily add a new profile/ARN pair)
    if (Object.keys(items.HighlightTermsAndColors).length == 0) {
      addTableRow('#highlight_term_and_colors table tr:last', null, null);
    }

     // Set the html for the Role ARN's Table
     $("#configs_extra_key_value_pairs").html('<table><tr id="tr_header"><th>Key</th><th>Value</th><th></th><th></th></tr></table>');
     // For each profile/ARN pair add table row (showing the profile-name and ARN)
     for (var profile in items.ConfigExtraKeys) {
       if (items.ConfigExtraKeys.hasOwnProperty(profile)) {
         addTableRow('#tr_header', profile, items.ConfigExtraKeys[profile]);
       }
     }
     // Add a blank table row if there are now current entries (So the user can easily add a new profile/ARN pair)
     if (Object.keys(items.ConfigExtraKeys).length == 0) {
       addTableRow('#configs_extra_key_value_pairs table tr:last', null, null);
     }

     $("#role_arns").html('<table><tr id="tr_header"><th>Profile</th><th>ARN of the role</th><th></th><th></th></tr></table>');
    // For each profile/ARN pair add table row (showing the profile-name and ARN)
    for (var profile in items.RoleArns) {
      if (items.RoleArns.hasOwnProperty(profile)) {
        addTableRow('#tr_header', profile, items.RoleArns[profile]);
      }
    }
    // Add a blank table row if there are now current entries (So the user can easily add a new profile/ARN pair)
    if (Object.keys(items.RoleArns).length == 0) {
      addTableRow('#role_arns table tr:last', null, null);
    }

   

    $("#filter_role_arns").html('<table><tr id="tr_header"><th>Profile</th><th>ARN of the role</th><th></th><th></th></tr></table>');
    // For each profile/ARN pair add table row (showing the profile-name and ARN)
    for (var profile in items.FilterRoleArns) {
      if (items.FilterRoleArns.hasOwnProperty(profile)) {
        addTableRow('#tr_header', profile, items.FilterRoleArns[profile]);
      }
    }
    // Add a blank table row if there are now current entries (So the user can easily add a new profile/ARN pair)
    if (Object.keys(items.FilterRoleArns).length == 0) {
      addTableRow('#filter_role_arns table tr:last', null, null);
    }


    // Show/hide divCustomSessionDuration
    showCustomSessionDurationDiv();
  });
}

// Add a blank table row for the user to add a new profile/ARN pair
function addTableRow(previousRowJquerySelector, profile, arn) {
  // Generate random identifier for the to be added row
  var newRowId = randomId();
  $(previousRowJquerySelector).after(getTableRowHtml(newRowId, profile, arn));
  // Add eventHandlers for the newly added buttons
  $('#btn_add_' + newRowId).on("click", function () {
    addTableRow('#tr_' + newRowId, null, null);
  });
  $('#btn_del_' + newRowId).on("click", function () {
    delTableRow('#tr_' + newRowId);
  });
}

// Remove table row
function delTableRow(tableRowJquerySelector) {
  // Remove table row from the DOM including bound events
  $(tableRowJquerySelector).remove();
}

// Generate HTML for a table row of the a table
function getTableRowHtml(tableRowId, key, value) {
  var input_key = '';
  var input_value = '';
  // If profile and arn are not NULL, generate HTML value attribute
  if (key) { input_key = 'value="' + key + '"' };
  if (value) { input_value = 'value="' + value + '"' };
  // Generate HTML for the row
  var html = '<tr id="tr_' + tableRowId + '">\
          <th><input type="text" id="key_' + tableRowId + '" size="18" ' + input_key + '></th> \
          <th><input type="text" id="value_' + tableRowId + '" size="55" ' + input_value + '></th> \
          <th><button id="btn_del_' + tableRowId + '">DEL</button></th> \
          <th><button id="btn_add_' + tableRowId + '">ADD</button></th> \
          </tr>';
  return html;
}

function randomId() {
  return Math.random().toString(36).substr(2, 8);
}

function showCustomSessionDurationDiv() {
  const selectedValue = document.querySelector('select[name="SessionDuration"]').value;
  const addClass = selectedValue === 'yes' ? 'element-hide' : 'element-visible';
  const removeClass = selectedValue === 'no' ? 'element-hide' : 'element-visible';
  document.getElementById('divCustomSessionDuration').classList.add(addClass);
  document.getElementById('divCustomSessionDuration').classList.remove(removeClass);
}

document.addEventListener('DOMContentLoaded', restore_options);
document.getElementById('save').addEventListener('click', save_options);
document.getElementById('SessionDuration').addEventListener('change', showCustomSessionDurationDiv);