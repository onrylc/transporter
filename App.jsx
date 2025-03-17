import React, { useState } from 'react';
import { Box, Button, Container, Typography, Modal, Paper } from '@mui/material';
import { XMLParser } from 'fast-xml-parser';

const modalStyle = {
  position: 'absolute',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  width: '80%',
  maxHeight: '80vh',
  bgcolor: 'background.paper',
  boxShadow: 24,
  p: 4,
  overflow: 'auto'
};

function App() {
  const [jsonSchema, setJsonSchema] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [validationErrors, setValidationErrors] = useState([]);

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.name.endsWith('.dmn')) {
      setValidationErrors([{
        message: 'Invalid file type',
        details: 'Please upload a valid DMN file with .dmn extension'
      }]);
      return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const content = e.target.result;
        const parser = new XMLParser({
          ignoreAttributes: false,
          attributeNamePrefix: '_',
          isArray: (name) => [
            'dmn:inputData', 'dmn:itemDefinition', 'dmn:itemComponent',
            'dmn:binding', 'dmn:contextEntry', 'dmn:formalParameter'
          ].includes(name),
          textNodeName: '_text'
        });

        const parsed = parser.parse(content);
        const definitions = parsed['dmn:definitions'];
        
        if (!definitions) {
          throw new Error('Invalid DMN file structure');
        }

        // Extract all inputData elements
        const inputDataMap = (definitions['dmn:inputData'] || []).reduce((acc, input) => {
          const typeRef = input['dmn:variable']._typeRef;
          acc[input._name] = {
            typeRef,
            components: findItemDefinition(definitions['dmn:itemDefinition'], typeRef),
            namespace: input._id
          };
          return acc;
        }, {});

        // Generate JSON schema with example values
        const schema = Object.fromEntries(
          Object.entries(inputDataMap).map(([key, def]) => [
            key,
            generateExampleValue(def.components, definitions['dmn:itemDefinition'])
          ])
        );

        setJsonSchema(schema);
        setModalOpen(true);
        setValidationErrors([]);
      } catch (error) {
        setValidationErrors([{
          message: 'Processing error',
          details: error.message
        }]);
      }
    };
    reader.readAsText(file);
  };

  // Recursively find item definitions and their components
  const findItemDefinition = (itemDefinitions, typeRef) => {
    const definition = itemDefinitions.find(d => d._name === typeRef);
    if (!definition) return null;
  
    return (definition['dmn:itemComponent'] || []).map(component => ({
      name: component._name,
      typeRef: component['dmn:typeRef'],
      components: component['dmn:typeRef'] ? 
        findItemDefinition(itemDefinitions, component['dmn:typeRef']) : null
    }));
  };

  // Generate example values based on type references
  const generateExampleValue = (components, itemDefinitions = []) => {
    if (!components) return null;
  
    return components.reduce((acc, component) => {
      const def = component.typeRef && itemDefinitions.find(d => d._name === component.typeRef);
      
      if (def) {
        // Check for primitive types with allowed values
        if (!def['dmn:itemComponent']?.length && def['dmn:allowedValues']) {
          const allowedValues = def['dmn:allowedValues']?.[0]?._text?.match(/"([^"]+)"/g)?.map(v => v.replace(/^"/, '').replace(/"$/, ''));
          acc[component.name] = allowedValues?.[0] || (def._typeRef ?? 'string').toLowerCase();
        } else if (def['dmn:itemComponent']?.length > 0) {
          acc[component.name] = (def['dmn:itemComponent'] || []).reduce((nestedAcc, comp) => ({
            ...nestedAcc,
            [comp._name]: generateExampleValue([{ 
              name: comp._name,
              typeRef: comp['dmn:typeRef'],
              components: comp['dmn:typeRef'] ? findItemDefinition(itemDefinitions, comp['dmn:typeRef']) : null
            }], itemDefinitions)
          }), {});
        } else {
          const type = (def['dmn:typeRef'] || def?._typeRef) ?? 'string';
          acc[component.name] = type === 'number' ? 0 :
            type === 'boolean' ? true :
            'example_' + type.toLowerCase();
        }
      } else {
        acc[component.name] = component.typeRef ? 
          generateExampleValue(component.components, itemDefinitions) :
          (component.typeRef ?? 'string') === 'number' ? 0 :
          (component.typeRef ?? 'string') === 'boolean' ? true :
          'example_' + (component.typeRef ?? 'string').toLowerCase();
      }
      return acc;
    }, {});
  };

  return (
    <Container>
      <Box my={4}>
        <Typography variant="h4" gutterBottom>
          DMN to JSON Schema Generator
        </Typography>
        <Button
          variant="contained"
          component="label"
        >
          Upload DMN File
          <input type="file" hidden onChange={handleFileUpload} />
        </Button>

        {validationErrors.length > 0 && (
          <Paper elevation={2} style={{ padding: '16px', marginTop: '16px', color: 'red' }}>
            {validationErrors.map((err, i) => (
              <div key={i}>
                <strong>{err.message}:</strong> {err.details}
              </div>
            ))}
          </Paper>
        )}

        <Modal open={modalOpen} onClose={() => setModalOpen(false)}>
          <Paper sx={modalStyle}>
            <Typography variant="h6" gutterBottom>
              Generated JSON Schema
            </Typography>
            <pre>
              {JSON.stringify(jsonSchema, null, 2)}
            </pre>
          </Paper>
        </Modal>
      </Box>
    </Container>
  );
}

export default App;