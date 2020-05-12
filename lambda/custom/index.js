/* eslint-disable  func-names */
/* eslint-disable  no-console */

const Alexa = require('ask-sdk-core');
const questions = require('./questions');
const i18n = require('i18next');
const sprintf = require('i18next-sprintf-postprocessor');

const ANSWER_COUNT = 4;
const GAME_LENGTH = 5;
const SKILL_NAME = 'Ramayana Game';
const FALLBACK_MESSAGE = `The ${SKILL_NAME} skill can\'t help you with that.  It can ask you questions about Ramayana if you say start game. What can I help you with?`;
const FALLBACK_REPROMPT = 'What can I help you with?';
const APL_DOC = require ('./document/renderPage.json' ) ; 
const TWO_PAGER_COMMANDS =  require ('./document/twoSpeakItemsCommand.json' ) ;
const ONE_PAGER_COMMANDS =  require ('./document/oneSpeakItemCommand.json' ) ;
const TOKEN_ID = 'pagerSample';
const firstTransformerList = [
      {
          "inputPath": "phraseSsml",
          "outputName": "phraseAsSpeech",
          "transformer": "ssmlToSpeech"
      }
    ];
const secondTransformerList = [
      {
          "inputPath": "phraseSsml",
          "outputName": "nextPhraseAsSpeech",
          "transformer": "ssmlToSpeech"
      }
    ];

function makePage(phraseText="",repromptText="",phraseSSMLProperty="",transformerList=[]) {
  return {
    "phraseText" : phraseText ,
    "repromptText":repromptText,
    "properties" :  {
      "phraseSsml" : phraseSSMLProperty
    },
    "transformers": transformerList
  };
}

function supportsDisplay(handlerInput) {
  return handlerInput.requestEnvelope.context
      && handlerInput.requestEnvelope.context.System
      && handlerInput.requestEnvelope.context.System.device
      && handlerInput.requestEnvelope.context.System.device.supportedInterfaces
      && (handlerInput.requestEnvelope.context.System.device.supportedInterfaces['Alexa.Presentation.APL']
        || handlerInput.requestEnvelope.context.System.device.supportedInterfaces.Display)
      && handlerInput.requestEnvelope.context.Viewport;
}

function populateGameQuestions(translatedQuestions) {
  const gameQuestions = [];
  const indexList = [];
  let index = translatedQuestions.length;
  if (GAME_LENGTH > index) {
    throw new Error('Invalid Game Length.');
  }

  for (let i = 0; i < translatedQuestions.length; i += 1) {
    indexList.push(i);
  }

  for (let j = 0; j < GAME_LENGTH; j += 1) {
    const rand = Math.floor(Math.random() * index);
    index -= 1;

    const temp = indexList[index];
    indexList[index] = indexList[rand];
    indexList[rand] = temp;
    gameQuestions.push(indexList[index]);
  }
  return gameQuestions;
}

function populateRoundAnswers(
  gameQuestionIndexes,
  correctAnswerIndex,
  correctAnswerTargetLocation,
  translatedQuestions
) {
  const answers = [];
  const translatedQuestion = translatedQuestions[gameQuestionIndexes[correctAnswerIndex]];
  const answersCopy = translatedQuestion[Object.keys(translatedQuestion)[0]].slice();
  let index = answersCopy.length;

  if (index < ANSWER_COUNT) {
    throw new Error('Not enough answers for question.');
  }

  // Shuffle the answers, excluding the first element which is the correct answer.
  for (let j = 1; j < answersCopy.length; j += 1) {
    const rand = Math.floor(Math.random() * (index - 1)) + 1;
    index -= 1;

    const swapTemp1 = answersCopy[index];
    answersCopy[index] = answersCopy[rand];
    answersCopy[rand] = swapTemp1;
  }

  // Swap the correct answer into the target location
  for (let i = 0; i < ANSWER_COUNT; i += 1) {
    answers[i] = answersCopy[i];
  }
  const swapTemp2 = answers[0];
  answers[0] = answers[correctAnswerTargetLocation];
  answers[correctAnswerTargetLocation] = swapTemp2;
  return answers;
}

function isAnswerSlotValid(intent) {
  const answerSlotFilled = intent
    && intent.slots
    && intent.slots.Answer
    && intent.slots.Answer.value;
  const answerSlotIsInt = answerSlotFilled
    && !Number.isNaN(parseInt(intent.slots.Answer.value, 10));
  return answerSlotIsInt
    && parseInt(intent.slots.Answer.value, 10) < (ANSWER_COUNT + 1)
    && parseInt(intent.slots.Answer.value, 10) > 0;
}

function handleUserGuess(userGaveUp, handlerInput) {
  const { requestEnvelope, attributesManager, responseBuilder } = handlerInput;
  const { intent } = requestEnvelope.request;

  const answerSlotValid = isAnswerSlotValid(intent);

  let speechOutput = '';
  let speechOutputAnalysis = '';
  let aplFirstPageSpeechOutput = '';
  let aplSecondPageSpeechOutput = '';
  const sessionAttributes = attributesManager.getSessionAttributes();
  const gameQuestions = sessionAttributes.questions;
  let correctAnswerIndex = parseInt(sessionAttributes.correctAnswerIndex, 10);
  let currentScore = parseInt(sessionAttributes.score, 10);
  let currentQuestionIndex = parseInt(sessionAttributes.currentQuestionIndex, 10);
  const { correctAnswerText } = sessionAttributes;
  const requestAttributes = attributesManager.getRequestAttributes();
  const translatedQuestions = requestAttributes.t('QUESTIONS');


  if (answerSlotValid
    && parseInt(intent.slots.Answer.value, 10) === sessionAttributes.correctAnswerIndex) {
    currentScore += 1;
    speechOutputAnalysis = requestAttributes.t('ANSWER_CORRECT_MESSAGE');
  } else {
    if (!userGaveUp) {
      speechOutputAnalysis = requestAttributes.t('ANSWER_WRONG_MESSAGE');
    }

    speechOutputAnalysis += requestAttributes.t(
      'CORRECT_ANSWER_MESSAGE',
      correctAnswerIndex,
      correctAnswerText
    );
  }

  // Check if we can exit the game session after GAME_LENGTH questions (zero-indexed)
  if (sessionAttributes.currentQuestionIndex === GAME_LENGTH - 1) {
    aplFirstPageSpeechOutput = speechOutput + speechOutputAnalysis;
    aplSecondPageSpeechOutput = requestAttributes.t(
      'GAME_OVER_MESSAGE',
      currentScore.toString(),
      GAME_LENGTH.toString()
    ); 
    speechOutput = userGaveUp ? '' : requestAttributes.t('ANSWER_IS_MESSAGE');
    speechOutput += speechOutputAnalysis + requestAttributes.t(
      'GAME_OVER_MESSAGE',
      currentScore.toString(),
      GAME_LENGTH.toString()
    );
    
    if (supportsDisplay(handlerInput)) {
      let payload = {
                "phrase": makePage(aplFirstPageSpeechOutput,"",`<speak>${aplFirstPageSpeechOutput}</speak>`,firstTransformerList),
                "nextPhrase": makePage(aplSecondPageSpeechOutput,"",`<speak>${aplSecondPageSpeechOutput}</speak>`,secondTransformerList)
                };
      speechOutput = "";

      handlerInput.responseBuilder
      .addDirective( 
        {
          type: 'Alexa.Presentation.APL.RenderDocument',
          version: '1.1',
          document : APL_DOC  ,
          datasources : payload,
          token : TOKEN_ID ,
        })
        .addDirective (
          {
            type: 'Alexa.Presentation.APL.ExecuteCommands',
            token : TOKEN_ID ,
            commands :
            [
              TWO_PAGER_COMMANDS
            ]
          });
    }

    return responseBuilder
      .speak(speechOutput)
      .getResponse();
  }
  currentQuestionIndex += 1;
  correctAnswerIndex = Math.floor(Math.random() * (ANSWER_COUNT));
  const spokenQuestion = Object.keys(translatedQuestions[gameQuestions[currentQuestionIndex]])[0];
  const roundAnswers = populateRoundAnswers(
    gameQuestions,
    currentQuestionIndex,
    correctAnswerIndex,
    translatedQuestions
  );
  const questionIndexForSpeech = currentQuestionIndex + 1;
  let repromptText = requestAttributes.t(
    'TELL_QUESTION_MESSAGE',
    questionIndexForSpeech.toString(),
    spokenQuestion
  );

  for (let i = 0; i < ANSWER_COUNT; i += 1) {
    repromptText += `${i + 1}. ${roundAnswers[i]}. `;
  }
  
  speechOutput += userGaveUp ? '' : requestAttributes.t('ANSWER_IS_MESSAGE');
  aplFirstPageSpeechOutput = speechOutput + speechOutputAnalysis + requestAttributes.t('SCORE_IS_MESSAGE', currentScore.toString());
  aplSecondPageSpeechOutput = repromptText;
  speechOutput += speechOutputAnalysis
    + requestAttributes.t('SCORE_IS_MESSAGE', currentScore.toString())
    + repromptText;
  

  const translatedQuestion = translatedQuestions[gameQuestions[currentQuestionIndex]];

  Object.assign(sessionAttributes, {
    speechOutput: repromptText,
    repromptText,
    currentQuestionIndex,
    correctAnswerIndex: correctAnswerIndex + 1,
    questions: gameQuestions,
    score: currentScore,
    correctAnswerText: translatedQuestion[Object.keys(translatedQuestion)[0]][0]
  });

  if (supportsDisplay(handlerInput)) {
    let payload = {
      "phrase": makePage(aplFirstPageSpeechOutput,"",`<speak>${aplFirstPageSpeechOutput}</speak>`,firstTransformerList),
      "nextPhrase": makePage(aplSecondPageSpeechOutput,"",`<speak>${aplSecondPageSpeechOutput}</speak>`,secondTransformerList)};
    speechOutput = "";

    handlerInput.responseBuilder
    .addDirective( 
      {
        type: 'Alexa.Presentation.APL.RenderDocument',
        version: '1.1',
        document : APL_DOC  ,
        datasources : payload ,
        token : TOKEN_ID ,
      })
      .addDirective (
        {
          type: 'Alexa.Presentation.APL.ExecuteCommands',
          token : TOKEN_ID ,
          commands :
          [
            TWO_PAGER_COMMANDS
          ]
        });
  }

  return responseBuilder.speak(speechOutput)
    .reprompt(repromptText)
    .withSimpleCard(requestAttributes.t('GAME_NAME'), repromptText)
    .getResponse();
}

function startGame(newGame, handlerInput) {
  const requestAttributes = handlerInput.attributesManager.getRequestAttributes();
  let speechOutput = newGame
    ? requestAttributes.t('NEW_GAME_MESSAGE', requestAttributes.t('GAME_NAME'))
      + requestAttributes.t('WELCOME_MESSAGE', GAME_LENGTH.toString())
    : '';
  let aplFirstPageSpeechOutput = speechOutput;
  const translatedQuestions = requestAttributes.t('QUESTIONS');
  const gameQuestions = populateGameQuestions(translatedQuestions);
  const correctAnswerIndex = Math.floor(Math.random() * (ANSWER_COUNT));

  const roundAnswers = populateRoundAnswers(
    gameQuestions,
    0,
    correctAnswerIndex,
    translatedQuestions
  );
  const currentQuestionIndex = 0;
  const spokenQuestion = Object.keys(translatedQuestions[gameQuestions[currentQuestionIndex]])[0];
  let repromptText = requestAttributes.t('TELL_QUESTION_MESSAGE', '1', spokenQuestion);

  for (let i = 0; i < ANSWER_COUNT; i += 1) {
    repromptText += `${i + 1}.  ${roundAnswers[i]}. `;
  }

  speechOutput += repromptText;
  const sessionAttributes = {};

  const translatedQuestion = translatedQuestions[gameQuestions[currentQuestionIndex]];

  Object.assign(sessionAttributes, {
    speechOutput: repromptText,
    repromptText,
    currentQuestionIndex,
    correctAnswerIndex: correctAnswerIndex + 1,
    questions: gameQuestions,
    score: 0,
    correctAnswerText: translatedQuestion[Object.keys(translatedQuestion)[0]][0]
  });

  handlerInput.attributesManager.setSessionAttributes(sessionAttributes);

  if (supportsDisplay(handlerInput)) {
    let payload = {
      "phrase": makePage(aplFirstPageSpeechOutput,"",`<speak>${aplFirstPageSpeechOutput}</speak>`,firstTransformerList),
      "nextPhrase": makePage(repromptText,"",`<speak>${repromptText}</speak>`,secondTransformerList)};
    speechOutput = "";
    handlerInput.responseBuilder
    .addDirective( 
      {
        type: 'Alexa.Presentation.APL.RenderDocument',
        version: '1.1',
        document : APL_DOC  ,
        datasources : payload ,
        token : TOKEN_ID ,
      })
      .addDirective (
        {
          type: 'Alexa.Presentation.APL.ExecuteCommands',
          token : TOKEN_ID ,
          commands :
          [
            TWO_PAGER_COMMANDS
          ]
        });
  }

  return handlerInput.responseBuilder
    .speak(speechOutput)
    .reprompt(repromptText)
    .withSimpleCard(requestAttributes.t('GAME_NAME'), repromptText)
    .getResponse();
}

function helpTheUser(newGame, handlerInput) {
  const requestAttributes = handlerInput.attributesManager.getRequestAttributes();
  const askMessage = newGame
    ? requestAttributes.t('ASK_MESSAGE_START')
    : requestAttributes.t('REPEAT_QUESTION_MESSAGE') + requestAttributes.t('STOP_MESSAGE');
  let speechOutput = requestAttributes.t('HELP_MESSAGE', GAME_LENGTH) + askMessage;
  const repromptText = requestAttributes.t('HELP_REPROMPT') + askMessage;

  if (supportsDisplay(handlerInput)) {
    let payload = {
        "phrase": makePage(speechOutput,repromptText,`<speak>${speechOutput}</speak>`,firstTransformerList),
        "nextPhrase": makePage("none","<speak></speak>","<speak></speak>",secondTransformerList)
        };
    speechOutput = "";

    handlerInput.responseBuilder
    .addDirective( 
      {
        type: 'Alexa.Presentation.APL.RenderDocument',
        version: '1.1',
        document : APL_DOC  ,
        datasources : payload ,
        token : TOKEN_ID ,
      })
      .addDirective (
        {
          type: 'Alexa.Presentation.APL.ExecuteCommands',
          token : TOKEN_ID ,
          commands :
          [
            ONE_PAGER_COMMANDS
          ]
        });
  }

  return handlerInput.responseBuilder.speak(speechOutput).reprompt(repromptText).getResponse();
}

/* jshint -W101 */
const languageString = {
  en: {
    translation: {
      QUESTIONS: questions.QUESTIONS_EN_IN,
      GAME_NAME: 'Ramayana Game',
      HELP_MESSAGE: 'I will ask you %s multiple choice questions. Respond with the number of the answer. For example, say one, two, three, or four. To start a new game at any time, say, start game. ',
      REPEAT_QUESTION_MESSAGE: 'To repeat the last question, say, repeat. ',
      ASK_MESSAGE_START: 'Would you like to start playing?',
      HELP_REPROMPT: 'To give an answer to a question, respond with the number of the answer. ',
      STOP_MESSAGE: 'Would you like to keep playing?',
      QUIT_MESSAGE: 'Good bye.',
      CANCEL_MESSAGE: 'Ok, let\'s play again soon.',
      NO_MESSAGE: 'Ok, we\'ll play another time. Goodbye!',
      TRIVIA_UNHANDLED: 'Try saying a number between 1 and %s',
      HELP_UNHANDLED: 'Say yes to continue, or no to end the game.',
      START_UNHANDLED: 'Say start to start a new game.',
      NEW_GAME_MESSAGE: 'Welcome to %s. ',
      WELCOME_MESSAGE: 'I will ask you %s questions, try to get as many right as you can. Just say the number of the answer. Let\'s begin. ',
      ANSWER_CORRECT_MESSAGE: '<audio src="soundbank://soundlibrary/gameshow/gameshow_01"/> correct. ',
      ANSWER_WRONG_MESSAGE: '<audio src="soundbank://soundlibrary/gameshow/gameshow_02"/> wrong. ',
      CORRECT_ANSWER_MESSAGE: 'The correct answer is %s: %s. "/>',
      ANSWER_IS_MESSAGE: 'That answer is ',
      TELL_QUESTION_MESSAGE: 'Question %s. %s ',
      GAME_OVER_MESSAGE: 'You got %s out of %s questions correct. Thank you for playing!',
      SCORE_IS_MESSAGE: 'Your score is %s. '
    },
  },
  'hi-IN': {
    translation: {
      QUESTIONS: questions.QUESTIONS_HI_IN,
      GAME_NAME: 'रामायण का खेल',
      HELP_MESSAGE: 'मैं आपसे % s के बहुविकल्पीय प्रश्न पूछूँगी। जवाब की संख्या के साथ जवाब दें। उदाहरण के लिए, एक, दो, तीन या चार कहें। किसी भी समय एक नया खेल शुरू करने के लिए, कहें, खेल शुरू करें।',
      REPEAT_QUESTION_MESSAGE: 'अंतिम प्रश्न को दोहराने के लिए,  Say repeat.',
      ASK_MESSAGE_START: 'क्या आप खेलना शुरू करना चाहेंगे?',
      HELP_REPROMPT: 'किसी प्रश्न का उत्तर देने के लिए, उत्तर की संख्या के साथ उत्तर दें। ',
      STOP_MESSAGE: 'क्या आप खेलना जारी रखेंगे?',
      QUIT_MESSAGE: 'अच्छा अलविदा, फिर मिलते हैं।',
      CANCEL_MESSAGE: 'ठीक है, चलो जल्द ही फिर से खेलते हैं।',
      NO_MESSAGE: 'ठीक है, हम अगली बार खेलेंगे। अलविदा!',
      TRIVIA_UNHANDLED: '1 और %s के बीच की संख्या कहने का प्रयास करें।',
      HELP_UNHANDLED: 'जारी रखने के लिए Yes कहें या खेल को समाप्त करने के लिए No',
      START_UNHANDLED: 'Say Start to start a new game.',
      NEW_GAME_MESSAGE: '%s में आपका स्वागत है। ',
      WELCOME_MESSAGE: 'मैं आपसे %s प्रश्न पूछूँगी, जितना संभव हो उतना सही पाने की कोशिश करें। केवल उत्तर की संख्या कहें। चलो शुरू करें।',
      ANSWER_CORRECT_MESSAGE: '<audio src="soundbank://soundlibrary/gameshow/gameshow_01"/> सही जवाब।',
      ANSWER_WRONG_MESSAGE: '<audio src="soundbank://soundlibrary/gameshow/gameshow_02"/> गलत जवाब। ',
      CORRECT_ANSWER_MESSAGE: ' सही जवाब है %s: %s. ',
      ANSWER_IS_MESSAGE: '',
      TELL_QUESTION_MESSAGE: 'सवाल %s. %s ',
      GAME_OVER_MESSAGE: 'आपके 5 में से %s जवाब सही मिले। खेलने के लिए धन्यवाद!',
      SCORE_IS_MESSAGE: 'आपका स्कोर है %s '
    },
  },
};


const LocalizationInterceptor = {
  process(handlerInput) {
    const localizationClient = i18n.use(sprintf).init({
      lng: handlerInput.requestEnvelope.request.locale,
      overloadTranslationOptionHandler: sprintf.overloadTranslationOptionHandler,
      resources: languageString,
      returnObjects: true
    });

    const attributes = handlerInput.attributesManager.getRequestAttributes();
    attributes.t = function (...args) {
      return localizationClient.t(...args);
    };
  },
};

const LaunchRequest = {
  canHandle(handlerInput) {
    const { request } = handlerInput.requestEnvelope;

    return request.type === 'LaunchRequest'
      || (request.type === 'IntentRequest'
        && request.intent.name === 'AMAZON.StartOverIntent');
  },
  handle(handlerInput) {
    return startGame(true, handlerInput);
  },
};


const HelpIntent = {
  canHandle(handlerInput) {
    const { request } = handlerInput.requestEnvelope;

    return request.type === 'IntentRequest' && request.intent.name === 'AMAZON.HelpIntent';
  },
  handle(handlerInput) {
    const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();

    const newGame = !(sessionAttributes.questions);
    return helpTheUser(newGame, handlerInput);
  },
};

const FallbackHandler = {

  // 2018-May-01: AMAZON.FallackIntent is only currently available in en-US locale.

  //              This handler will not be triggered except in that locale, so it can be

  //              safely deployed for any locale.

  canHandle(handlerInput) {

    const request = handlerInput.requestEnvelope.request;

    return request.type === 'IntentRequest'

      && request.intent.name === 'AMAZON.FallbackIntent';

  },

  handle(handlerInput) {

    return handlerInput.responseBuilder

      .speak(FALLBACK_MESSAGE)

      .reprompt(FALLBACK_REPROMPT)

      .getResponse();

  },

};

const UnhandledIntent = {
  canHandle() {
    return true;
  },
  handle(handlerInput) {
    const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
    const requestAttributes = handlerInput.attributesManager.getRequestAttributes();
    if (Object.keys(sessionAttributes).length === 0) {
      let speechOutput = requestAttributes.t('START_UNHANDLED');
      let repromptText = speechOutput;
      if (supportsDisplay(handlerInput)) {
        let payload = {
          "phrase": makePage(speechOutput,speechOutput,`<speak>${speechOutput}</speak>`,firstTransformerList),
          "nextPhrase": makePage("none","<speak></speak>","<speak></speak>",secondTransformerList)
          };
        speechOutput = "";

        handlerInput.responseBuilder
        .addDirective( 
          {
            type: 'Alexa.Presentation.APL.RenderDocument',
            version: '1.1',
            document : APL_DOC  ,
            datasources : payload ,
            token : TOKEN_ID ,
          })
          .addDirective (
            {
              type: 'Alexa.Presentation.APL.ExecuteCommands',
              token : TOKEN_ID ,
              commands :
              [
                ONE_PAGER_COMMANDS
              ]
            });
      }
      return handlerInput.attributesManager
        .speak(speechOutput)
        .reprompt(repromptText)
        .getResponse();
    } else if (sessionAttributes.questions) {
      const speechOutput = requestAttributes.t('TRIVIA_UNHANDLED', ANSWER_COUNT.toString());
      const repromptText = speechOutput;
      if (supportsDisplay(handlerInput)) {
        let payload = {
          "phrase": makePage(speechOutput,speechOutput,`<speak>${speechOutput}</speak>`,firstTransformerList),
          "nextPhrase": makePage("none","<speak></speak>","<speak></speak>",secondTransformerList)
          };
        speechOutput = "";

        handlerInput.responseBuilder
        .addDirective( 
          {
            type: 'Alexa.Presentation.APL.RenderDocument',
            version: '1.1',
            document : APL_DOC  ,
            datasources : payload ,
            token : TOKEN_ID ,
          })
          .addDirective (
            {
              type: 'Alexa.Presentation.APL.ExecuteCommands',
              token : TOKEN_ID ,
              commands :
              [
                ONE_PAGER_COMMANDS
              ]
            });
      }
      return handlerInput.responseBuilder
        .speak(speechOutput)
        .reprompt(repromptText)
        .getResponse();
    }
    let speechOutput = requestAttributes.t('HELP_UNHANDLED');
    const repromptText = speechOutput;
    if (supportsDisplay(handlerInput)) {
      let payload = {
        "phrase": makePage(speechOutput,speechOutput,`<speak>${speechOutput}</speak>`,firstTransformerList),
        "nextPhrase": makePage("none","<speak></speak>","<speak></speak>",secondTransformerList)
      };
      speechOutput = "";
      handlerInput.responseBuilder
        .addDirective( 
          {
            type: 'Alexa.Presentation.APL.RenderDocument',
            version: '1.1',
            document : APL_DOC  ,
            datasources : payload ,
            token : TOKEN_ID ,
          })
          .addDirective (
            {
              type: 'Alexa.Presentation.APL.ExecuteCommands',
              token : TOKEN_ID ,
              commands :
              [
                ONE_PAGER_COMMANDS
              ]
            });
    }
    return handlerInput.responseBuilder.speak(speechOutput).reprompt(repromptText).getResponse();
  },
};

const SessionEndedRequest = {
  canHandle(handlerInput) {
    return handlerInput.requestEnvelope.request.type === 'SessionEndedRequest';
  },
  handle(handlerInput) {
    console.log(`Session ended with reason: ${handlerInput.requestEnvelope.request.reason}`);

    return handlerInput.responseBuilder.getResponse();
  },
};

const AnswerIntent = {
  canHandle(handlerInput) {
    return handlerInput.requestEnvelope.request.type === 'IntentRequest'
        && (handlerInput.requestEnvelope.request.intent.name === 'AnswerIntent'
        || handlerInput.requestEnvelope.request.intent.name === 'DontKnowIntent');
  },
  handle(handlerInput) {
    if (handlerInput.requestEnvelope.request.intent.name === 'AnswerIntent') {
      return handleUserGuess(false, handlerInput);
    }
    return handleUserGuess(true, handlerInput);
  },
};

const RepeatIntent = {
  canHandle(handlerInput) {
    return handlerInput.requestEnvelope.request.type === 'IntentRequest'
        && handlerInput.requestEnvelope.request.intent.name === 'AMAZON.RepeatIntent';
  },
  handle(handlerInput) {
    const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
    let speechOutput = sessionAttributes.speechOutput;
    let repromptText = sessionAttributes.repromptText;
    if (supportsDisplay(handlerInput)) {
        let payload = {
          "phrase": makePage(speechOutput,repromptText,`<speak>${speechOutput}</speak>`,firstTransformerList),
          "nextPhrase": makePage("none","<speak></speak>","<speak></speak>",secondTransformerList)
        };
        speechOutput = "";

      handlerInput.responseBuilder
        .addDirective( 
          {
            type: 'Alexa.Presentation.APL.RenderDocument',
            version: '1.1',
            document : APL_DOC  ,
            datasources : payload ,
            token : TOKEN_ID ,
          })
          .addDirective (
            {
              type: 'Alexa.Presentation.APL.ExecuteCommands',
              token : TOKEN_ID ,
              commands :
              [
                ONE_PAGER_COMMANDS
              ]
            });
    }
    
    return handlerInput.responseBuilder.speak(speechOutput)
      .reprompt(repromptText)
      .getResponse();
  },
};

const YesIntent = {
  canHandle(handlerInput) {
    return handlerInput.requestEnvelope.request.type === 'IntentRequest'
        && handlerInput.requestEnvelope.request.intent.name === 'AMAZON.YesIntent';
  },
  handle(handlerInput) {
    const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
    let speechOutput = sessionAttributes.speechOutput;
    let repromptText = sessionAttributes.repromptText;
    if (sessionAttributes.questions) {
      if (supportsDisplay(handlerInput)) {
        let payload = {
          "phrase": makePage(speechOutput,repromptText,`<speak>${speechOutput}</speak>`,firstTransformerList),
          "nextPhrase": makePage("none","<speak></speak>","<speak></speak>",secondTransformerList)
        };
        speechOutput = "";

        handlerInput.responseBuilder
        .addDirective( 
          {
            type: 'Alexa.Presentation.APL.RenderDocument',
            version: '1.1',
            document : APL_DOC  ,
            datasources : payload ,
            token : TOKEN_ID ,
          })
          .addDirective (
            {
              type: 'Alexa.Presentation.APL.ExecuteCommands',
              token : TOKEN_ID ,
              commands :
              [
                ONE_PAGER_COMMANDS
              ]
            });
      }
      
      return handlerInput.responseBuilder.speak(speechOutput)
        .reprompt(repromptText)
        .getResponse();
    }
    return startGame(false, handlerInput);
  },
};


const StopIntent = {
  canHandle(handlerInput) {
    return handlerInput.requestEnvelope.request.type === 'IntentRequest'
        && handlerInput.requestEnvelope.request.intent.name === 'AMAZON.StopIntent';
  },
  handle(handlerInput) {
    const requestAttributes = handlerInput.attributesManager.getRequestAttributes();
    let speechOutput = requestAttributes.t('QUIT_MESSAGE');
    if (supportsDisplay(handlerInput)) {
      let payload = {
        "phrase": makePage(speechOutput,speechOutput,`<speak>${speechOutput}</speak>`,firstTransformerList),
        "nextPhrase": makePage("none","<speak></speak>","<speak></speak>",secondTransformerList)
        };
      speechOutput = "";

      handlerInput.responseBuilder
      .addDirective( 
        {
          type: 'Alexa.Presentation.APL.RenderDocument',
          version: '1.1',
          document : APL_DOC  ,
          datasources : payload ,
          token : TOKEN_ID ,
        })
        .addDirective (
          {
            type: 'Alexa.Presentation.APL.ExecuteCommands',
            token : TOKEN_ID ,
            commands :
            [
              ONE_PAGER_COMMANDS
            ]
          });
    }
    return handlerInput.responseBuilder.speak(speechOutput)
      .withShouldEndSession(true)
      .getResponse();
  },
};

const CancelIntent = {
  canHandle(handlerInput) {
    return handlerInput.requestEnvelope.request.type === 'IntentRequest'
      && handlerInput.requestEnvelope.request.intent.name === 'AMAZON.CancelIntent';
  },
  handle(handlerInput) {
    const requestAttributes = handlerInput.attributesManager.getRequestAttributes();
    let speechOutput = requestAttributes.t('CANCEL_MESSAGE');
    if (supportsDisplay(handlerInput)) {
      let payload = {
        "phrase": makePage(speechOutput,speechOutput,`<speak>${speechOutput}</speak>`,firstTransformerList),
        "nextPhrase": makePage("none","<speak></speak>","<speak></speak>",secondTransformerList)
        };
      speechOutput = "";
      handlerInput.responseBuilder
      .addDirective( 
        {
          type: 'Alexa.Presentation.APL.RenderDocument',
          version: '1.1',
          document : APL_DOC  ,
          datasources : payload ,
          token : TOKEN_ID ,
        })
        .addDirective (
          {
            type: 'Alexa.Presentation.APL.ExecuteCommands',
            token : TOKEN_ID ,
            commands :
            [
              ONE_PAGER_COMMANDS
            ]
          }); 
    }
    return handlerInput.responseBuilder.speak(speechOutput)
      .getResponse();
  },
};

const NoIntent = {
  canHandle(handlerInput) {
    return handlerInput.requestEnvelope.request.type === 'IntentRequest'
      && handlerInput.requestEnvelope.request.intent.name === 'AMAZON.NoIntent';
  },
  handle(handlerInput) {
    const requestAttributes = handlerInput.attributesManager.getRequestAttributes();
    let speechOutput = requestAttributes.t('NO_MESSAGE');
    if (supportsDisplay(handlerInput)) {
      let payload = {
        "phrase": makePage(speechOutput,"",`<speak>${speechOutput}</speak>`,firstTransformerList),
        "nextPhrase": makePage("none","<speak></speak>","<speak></speak>",secondTransformerList)
        };
      speechOutput = "";
      handlerInput.responseBuilder
      .addDirective( 
        {
          type: 'Alexa.Presentation.APL.RenderDocument',
          version: '1.1',
          document : APL_DOC  ,
          datasources : payload ,
          token : TOKEN_ID ,
        })
        .addDirective (
          {
            type: 'Alexa.Presentation.APL.ExecuteCommands',
            token : TOKEN_ID ,
            commands :
            [
              ONE_PAGER_COMMANDS
            ]
          });
    }
    return handlerInput.responseBuilder.speak(speechOutput).getResponse();
  },
};

const ErrorHandler = {
  canHandle() {
    return true;
  },
  handle(handlerInput, error) {
    console.log(`Error handled: ${error.message}`);
    let speechOutput = 'Sorry, I can\'t understand the command. Please say again.';
    const repromptText = speechOutput;
    if (supportsDisplay(handlerInput)) {
      let payload = {
        "phrase": makePage(speechOutput,speechOutput,`<speak>${speechOutput}</speak>`,firstTransformerList),
        "nextPhrase": makePage("none","<speak></speak>","<speak></speak>",secondTransformerList)
        };
      speechOutput = "";
      handlerInput.responseBuilder
      .addDirective( 
        {
          type: 'Alexa.Presentation.APL.RenderDocument',
          version: '1.1',
          document : APL_DOC  ,
          datasources : payload ,
          token : TOKEN_ID ,
        })
        .addDirective (
          {
            type: 'Alexa.Presentation.APL.ExecuteCommands',
            token : TOKEN_ID ,
            commands :
            [
              TWO_PAGER_COMMANDS
            ]
          });
    }
    return handlerInput.responseBuilder
      .speak(speechOutput)
      .reprompt(repromptText)
      .getResponse();
  },
};

const skillBuilder = Alexa.SkillBuilders.custom();
exports.handler = skillBuilder
  .addRequestHandlers(
    LaunchRequest,
    HelpIntent,
    AnswerIntent,
    RepeatIntent,
    YesIntent,
    StopIntent,
    CancelIntent,
    NoIntent,
    SessionEndedRequest,
    FallbackHandler,
    UnhandledIntent
  )
  .addRequestInterceptors(LocalizationInterceptor)
  .addErrorHandlers(ErrorHandler)
  .lambda();
