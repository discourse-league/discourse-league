import computed from "ember-addons/ember-computed-decorators";
import { observes, on } from 'ember-addons/ember-computed-decorators';
import { ajax } from 'discourse/lib/ajax';
import loadScript from 'discourse/lib/load-script';
import Payment from '../models/payment';

export default Ember.Component.extend({
  classNameBindings: ['showFormClass', 'showLoadingSpinner'],

  @computed('braintreeLoading')
  formClass(braintreeLoading) {
    return braintreeLoading === true ? 'hidden' : undefined;
  },

  @computed('braintreeLoading')
  showLoading(braintreeLoading){
    return braintreeLoading;
  },

  @computed('showBilling')
  showSubmitButton(showBilling){
    return showBilling === true ? 'hidden' : undefined;
  },

  @computed('showBilling')
  showContinueButton(showBilling){
    return showBilling === true ? true : false;
  },

  @computed('verifyPayPal', 'showVerify')
  hideCreditCardFields(verifyPayPal, showVerify){
    if (verifyPayPal === true && showVerify === true){
      return 'hidden';
    }
    else {
      return undefined;
    }
  },

  @computed('showVerify')
  hidePayPalButton(showVerify){
    if (showVerify === true){
      return 'hidden';
    }
    else {
      return undefined;
    }
  },

  @computed('verifyPayPal', 'showVerify')
  hidePayPalVerify(verifyPayPal, showVerify){
    if (verifyPayPal === true && showVerify === true){
      return undefined;
    }
    else {
      return 'hidden';
    }
  },

  @on('init')
  braintree(){
    var self = this;
    this.set("braintreeLoading", true);
    ajax('/memberships/checkout/braintree-token', {dataType: "text"}).then(result => {
      var form = document.querySelector('#checkout-form');
      var continueButton = document.querySelector('#continue-checkout');
      var submit = document.querySelector('input[type="submit"]');
      var paypalButton = document.querySelector('#continue-paypal');
      loadScript("https://js.braintreegateway.com/web/3.15.0/js/client.min.js", { scriptTag: true }).then(() => {
        braintree.client.create({
          authorization: result
        }, function (clientErr, clientInstance) {
          if (clientErr) {
            // Handle error in client creation
            return;
          }
          loadScript("https://js.braintreegateway.com/web/3.15.0/js/hosted-fields.min.js", { scriptTag: true }).then(() => {
            braintree.hostedFields.create({
              client: clientInstance,
              styles: {
                'input': {
                  'font-size': '14pt'
                },
                'input.invalid': {
                  'color': 'red'
                },
                'input.valid': {
                  'color': 'green'
                },
                'input.disabled': {
                  'font-size': '12pt',
                  'color': 'inherit'
                }
              },
              fields: {
                number: {
                  selector: '#card-number',
                  placeholder: 'XXXX XXXX XXXX XXXX'
                },
                cvv: {
                  selector: '#cvv',
                  placeholder: '123'
                },
                expirationDate: {
                  selector: '#expiration-date',
                  placeholder: '10/2019'
                }
              }
            }, function (hostedFieldsErr, hostedFieldsInstance) {
              if (hostedFieldsErr) {
                console.log(hostedFieldsErr);
                // Handle error in Hosted Fields creation
                return;
              }

              self.set('continueDisabled', true);
              self.set('braintreeLoading', false);

              hostedFieldsInstance.on('validityChange', function (event) {
                var formValid = Object.keys(event.fields).every(function (key) {
                  return event.fields[key].isValid;
                });

                if (formValid) {
                  self.set('continueDisabled', false);
                } else {
                  self.set('continueDisabled', true);
                }
              });

              continueButton.addEventListener('click', function(event){
                self.set('verifyCreditCard', true);
                hostedFieldsInstance.addClass('number', 'disabled', function (addClassErr) {
                  if (addClassErr) {
                    console.error(addClassErr);
                  }
                });
                hostedFieldsInstance.addClass('cvv', 'disabled', function (addClassErr) {
                  if (addClassErr) {
                    console.error(addClassErr);
                  }
                });
                hostedFieldsInstance.addClass('expirationDate', 'disabled', function (addClassErr) {
                  if (addClassErr) {
                    console.error(addClassErr);
                  }
                });
                hostedFieldsInstance.setAttribute({
                  field: 'number',
                  attribute: 'disabled',
                  value: 'true'
                }, function (attributeErr) {
                  if (attributeErr) {
                    console.error(attributeErr);
                  }
                });
                hostedFieldsInstance.setAttribute({
                  field: 'cvv',
                  attribute: 'disabled',
                  value: 'true'
                }, function (attributeErr) {
                  if (attributeErr) {
                    console.error(attributeErr);
                  }
                });
                hostedFieldsInstance.setAttribute({
                  field: 'expirationDate',
                  attribute: 'disabled',
                  value: 'true'
                }, function (attributeErr) {
                  if (attributeErr) {
                    console.error(attributeErr);
                  }
                });
              });

              form.addEventListener('submit', function (event) {
                event.preventDefault();

                hostedFieldsInstance.tokenize(function (tokenizeErr, payload) {
                  if (tokenizeErr) {
                    // Handle error in Hosted Fields tokenization
                    console.error('Error tokenizing:', tokenizeErr);
                    return;
                  }
                  // Put `payload.nonce` into the `payment_method_nonce` input, and then
                  // submit the form. Alternatively, you could send the nonce to your server
                  // with AJAX.
                  document.querySelector('input[name="payment_method_nonce"]').value = payload.nonce;
                  self._submitNonce(payload.nonce);
                });
              }, false);
            });
          }); // loadScript

          loadScript("https://js.braintreegateway.com/web/3.15.0/js/paypal.min.js", { scriptTag: true }).then(() => {
            // Create a PayPal component.
            braintree.paypal.create({
              client: clientInstance
            }, function (paypalErr, paypalInstance) {

              // Stop if there was a problem creating PayPal.
              // This could happen if there was a network error or if it's incorrectly
              // configured.
              if (paypalErr) {
                console.error('Error creating PayPal:', paypalErr);
                return;
              }

              // Enable the button.
              paypalButton.removeAttribute('disabled');

              // When the button is clicked, attempt to tokenize.
              paypalButton.addEventListener('click', function (event) {
                // Because tokenization opens a popup, this has to be called as a result of
                // customer action, like clicking a button—you cannot call this at any time.
                paypalInstance.tokenize({
                  flow: 'vault'
                }, function (tokenizeErr, payload) {

                  // Stop if there was an error.
                  if (tokenizeErr) {
                    if (tokenizeErr.type !== 'CUSTOMER') {
                      console.error('Error tokenizing:', tokenizeErr);
                    }
                    return;
                  }

                  // Tokenization succeeded!
                  paypalButton.setAttribute('disabled', true);
                  self._submitNonce(payload.nonce);
                });

              }, false);

            });
          }); // loadScript

        }); //braintree.client.create
      });
    })
  },

  _submitNonce(nonce){
    var self = this;
    this.set("braintreeLoading", true);
    var result = Payment.submitNonce(this.get('membershipsLevel')[0].id, nonce, this.get("update"));
    result.then(response => {
      if (response.success){
        self.set('checkoutState', 'completed');
        self.set('showBilling', false);
        self.set('showVerify', false);
        self.set('showCompleted', true);
      }
      this.set("braintreeLoading", false);
    }).catch(e => {
        if (e.jqXHR.responseJSON && e.jqXHR.responseJSON.errors) {
          bootbox.alert(I18n.t("generic_error_with_reason", {error: e.jqXHR.responseJSON.errors.join('. ')}));
        } else {
          bootbox.alert(I18n.t("generic_error"));
        }
        self.set('checkoutState', 'billing-payment');
        self.set('showVerify', false);
        self.set('showBilling', true);
        this.set("braintreeLoading", false);
      });
  },

  actions: {
    submitPayment(){
      var submit = document.querySelector('input[type="submit"]');
      var fields = $('.hosted-field');
      submit.removeAttribute('disabled');
      fields.addClass('disabled');
      this.set('showBilling', false);
      this.set('showVerify', true);
      this.set('checkoutState', 'verify');
    },

    submitPayPal(){
      this.set('showVerify', true);
      this.set('verifyPayPal', true);
      this.set('checkoutState', 'verify');
    }
  }
})