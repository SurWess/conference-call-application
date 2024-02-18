import test_join_leave
import test_fakeeh_scenarios
from test_deployment import TestDeployment

import unittest
import sys
import os
import random

os.environ['SERVER_URL'] = sys.argv[1]
os.environ['AMS_USER'] = sys.argv[2]
os.environ['AMS_PASSWORD'] = sys.argv[3]
os.environ['WAR_FILE'] = sys.argv[4]
os.environ['TEST_APP_NAME'] = "TestAPP"+str(random.randint(100, 999))

suite = unittest.TestSuite()
suite.addTest(TestDeployment('test_install_app'))
suite2 = unittest.TestLoader().loadTestsFromModule(test_fakeeh_scenarios)
suite.addTests(suite2)
suite.addTest(TestDeployment('test_delete_app'))

ret = not unittest.TextTestRunner(verbosity=2).run(suite).wasSuccessful()
sys.exit(ret)