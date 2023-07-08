function addFilter() {
  $("p:first").html('<div style="font-size:18px; margin-bottom:30px;border-bottom-style: ridge;">' +
  '<span>Account Filter:&nbsp;</span>' +
  '<input type="text" id="filterInput"></span></div>');

  $("#filterInput").bind("propertychange change click keyup input paste" ,function() {
    $(".saml-account-name").each(function(index) { 
      if ($("#filterInput").val() == "" || $(this).html().toLowerCase().includes($("#filterInput").val().toLowerCase())) {
        $(this).parent().parent().show();
      } else {
        $(this).parent().parent().hide();
      }
    });
  });

  $("#filterInput").focus();
}

function removeLogo() {
  $("h1.background").remove();
}

function removeHorizontalLine() {
  $('hr[style="border: 1px solid #ddd;"]').remove();
}

function removeDropDownIcon() {
  $('[id^="image"]').remove();
}

function removeAccountLabelPrefix() {
  $('.saml-account-name').text(function(i, text) {
    return text.replace('Account: ', '');
  });
}

function removeSignInButton() {
  $('#signin_button').remove();
}

function extractAccountData() {
  const accountElements = Array.from(document.querySelectorAll('.saml-account-name'));
  const accounts = accountElements.map(element => {
    const accountName = element.textContent.trim().split(' ')[0];
    const accountNumber = element.textContent.match(/\((\d+)\)/)[1];
    return { accountName, accountNumber };
  });

  chrome.storage.sync.set({ accounts }, function() {
    console.log('Account data saved to storage:', accounts);
  });
}

function makeLabelsButtons() {
  $('.saml-role-description').each(function() {
    var label = $(this);
    var link = $('<a>').attr('id', 'signin_button').attr('rel', 'noopener noreferrer').addClass('css3button').attr('href', '#').attr('alt', 'Continue').text(label.text()).css({
      'font-weight': 'normal',
      'color': 'white',
      'text-decoration': 'none',
      'padding': '5px 20px'
    });
    label.replaceWith(link);
  });
}

function moveRecentlyLoggedInRoles() {
  chrome.storage.sync.get(["RecentlyLoggedInRoles","ExtensionInstalledDate"], function(result) {
    var RecentlyLoggedInRoles = result.RecentlyLoggedInRoles || [];
    var ExtensionInstalledDate = result.ExtensionInstalledDate || [];
    var elementToFind;
    var firstMovedRole = null; // Variable to store the first moved role
    var lastMovedRole = null; // Variable to store the last moved role
    
    // Loop through the roles in reverse order
    for (var i = 0; i <= RecentlyLoggedInRoles.length - 1; i++) {
      var role = RecentlyLoggedInRoles[i];
      var radioButtonId = role.id;
      var dateTime = new Date(role.dateTime).toLocaleString(undefined, { year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' });
  
      elementToFind = 'input.saml-radio[id="' + radioButtonId + '"]';
      
      var radioElement = $(elementToFind);
      var topAccountElement = radioElement.parents('.saml-account').last();
      var fieldsetElement = $('fieldset');
      var accountName = topAccountElement.find('.saml-account-name');
      var accountText = accountName.text();
      accountName.text(accountText + ' , login at ' + dateTime);
  
      if(i <= RecentlyLoggedInRoles.length - 1) {
        fieldsetElement.prepend(topAccountElement);
        
        // Store the first and last moved roles
        if (i === 0) {
          lastMovedRole = topAccountElement;
        }
        firstMovedRole = topAccountElement; // Update firstMovedRole in every iteration
      }
    }
  
    // Add a line to the last moved role.
    if (lastMovedRole) {
      var lineAfterLastMovedRole = $('<hr>').css('margin-bottom', '35px').css('margin-top', '-25px');
      lastMovedRole.after(lineAfterLastMovedRole);
  
      // Add a label at the end of the moved roles that don't have a login date.
      if (ExtensionInstalledDate) {
        var dateTime = new Date(ExtensionInstalledDate).toLocaleString(undefined, { year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' });
  
        var label = $('<div>').text('Not Logged In Since : ' + dateTime + ' (Extension Installed Date) ').css('font-family', 'Helvetica,Arial,sans-serif').css('font-size', '18px').css('margin-bottom', '25px').css('margin-top', '-25px');
        lineAfterLastMovedRole.after(label);
      }
    }
  });
}

function removeExpandableContainer() {
  var expandableDivs = $('div.expandable-container');
  expandableDivs.removeClass('expandable-container');
}

function checkRadioButton() {
  $('.saml-account').on('click', '.saml-role.clickable-radio a', function() {
    var radio = $(this).prev('input[type="radio"]');
    radio.prop('checked', true);
    var radioButtonId = radio.attr('id');
    var currentDateTime = new Date();
    currentDateTime.setSeconds(0, 0); // Remove the seconds and milliseconds from the current date and time
    var dateTime = currentDateTime.toISOString();
  
    chrome.storage.sync.get(["RecentlyLoggedInRoles"], function(result) {
      var RecentlyLoggedInRoles = result.RecentlyLoggedInRoles || [];
  
      // Check if radioButtonId already exists in the array
      var existingRole = RecentlyLoggedInRoles.find(function(role) {
        return role.id === radioButtonId;
      });
  
      if (existingRole) {
        // Update the date-time for the existing role
        existingRole.dateTime = dateTime;
  
        // Move the existing role to the top of the array
        RecentlyLoggedInRoles = RecentlyLoggedInRoles.filter(function(role) {
          return role.id !== radioButtonId;
        });
        RecentlyLoggedInRoles.unshift(existingRole);
      } else {
        // Add the new role at the beginning of the array
        RecentlyLoggedInRoles.unshift({ id: radioButtonId, dateTime: dateTime });
      }
  
      chrome.storage.sync.set({ "RecentlyLoggedInRoles": RecentlyLoggedInRoles }, function() {
        radio.closest('form').submit();
      });
    });
  });
}

function highlightAccountNames() {
  chrome.storage.sync.get({
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
  }, function (items) {
    var highlightTermsAndColors = items.HighlightTermsAndColors;
    console.log('HighlightTermsAndColors-2')
    console.log(highlightTermsAndColors)
    
    // Iterate through saml-account class
    $(".saml-account").each(function(i, accountDiv) {
      // Find and iterate through saml-account-name class
      $(accountDiv).find(".saml-account-name").each(function(x, accountNameDiv) {
        var accountName = $(accountNameDiv).text().toString();
  
        // Iterate through highlight terms and colors object
        for (var searchTerm in highlightTermsAndColors) {
          if (highlightTermsAndColors.hasOwnProperty(searchTerm)) {
            var color = highlightTermsAndColors[searchTerm] || '';
  
            // Check if account name includes the search term
            if (accountName.includes(searchTerm)) {
              // Highlight saml-account div with the corresponding color
              //$(accountDiv).css("background-color", color);
              $(accountNameDiv).css("color", color);
              break; // Break out of the loop if a match is found
            }
          }
        }
      }); // accountDiv find each
    }); // saml-account each
  });
}

$(function() {
  addFilter();
  removeLogo();
  removeHorizontalLine();
  removeDropDownIcon();
  removeAccountLabelPrefix();
  removeSignInButton();
  extractAccountData();
  makeLabelsButtons();
  moveRecentlyLoggedInRoles();
  removeExpandableContainer();
  checkRadioButton();
  highlightAccountNames();
});
